# Claude on the Web — Screenshot Evidence

**Source set:** `claude-web-*` (27 files), all found in
`/Users/siddhartha/Desktop/claude_reference/` (files `157` through `183`).
Zero matches in `/Users/siddhartha/Desktop/references-2` or
`/Users/siddhartha/Desktop/chatgpt_reference`.

**Every one of the 27 assigned images was opened and visually inspected**
with the Read tool (not inferred from filename). Evidence below is recorded
per-screen, then synthesized into trees/tables at the end.

## Caveats (read before using this as ground truth)

- **Point-in-time captures, exact date unknown.** Internal signals suggest a
  build from mid-to-late 2026 (a skill card shows "Last updated 7/21/26";
  models shown are labeled "Sonnet 5" and "Opus 4.8" — treat these model
  names as **what the screenshot shows**, not as verified current model IDs;
  do not copy them into product code per repo policy on model IDs).
- Two different browser chromes appear across the set: (1) a full desktop
  browser window with a visible bookmarks bar and the complete claude.ai
  left sidebar (screenshots 165–180), and (2) a narrower, sidebar-less
  "launcher" surface with only a panel-toggle icon top-left and a
  "☁ Beta" or ghost-icon top-right (screenshots 181–183). These may be two
  different surfaces (e.g. full web app vs. a Chrome-extension side panel /
  popup), not necessarily the same product shell. I have not confirmed which,
  and I flag it rather than guess.
- The **Connectors** settings panel was captured twice with materially
  different content (screenshot 160 vs. 180) — see "Notable design
  decisions" below. This may reflect two different points in time / two
  different accounts, not a single consistent state. Flagged, not resolved.
- Nothing in this set shows: connector/plugin/skill **detail or install
  flow** (only directory grid + settings list), a **populated** Cowork
  global-instructions text field (178 shows only the empty "Edit" affordance),
  the **Home tab's own** sidebar-customize modal (only the Code tab's
  equivalent was captured), or any **error/permission-denied** state. Not
  covered by these captures — not invented below.
- Some card descriptions in the three directories are visually truncated
  with "…" in the source UI itself; truncation is preserved verbatim rather
  than completed from guesswork.

---

## Screen-by-screen record

### Home tab — primary views (full sidebar shell)

**165 — Home → Chats and tasks (`claude-web-home-chats-and-tasks-recents-list-with-tasks.png`)**

- Browser chrome: macOS traffic lights, tab title "Claude", address bar
  "claude.ai", bookmarks bar "All Bookmarks".
- Left sidebar: wordmark "Claude", panel-toggle icon, search icon. Tab strip:
  **Home** (active) | **Code**. Nav list: `+ New`, `Chats and tasks`
  (active), `Projects`, `Artifacts`, `Scheduled`, `Customize`. Below, a
  "Recents" label with a sort icon, then 5 recent items (2 with a small blue
  unread dot). Bottom of sidebar: "Design 🎨 Labs" pill, then account row
  "Siddhartha · Max ▾" with a download icon and a blue dot.
- Main panel header: "Chats and tasks" (H1), right-aligned controls
  **Select**, **Filter by All ▾**, **New** (primary white button).
- Search field: placeholder "Search chats and tasks…".
- List rows (icon, title, right-aligned relative time):
  - ☰ (task-list icon) "UI image naming and technical documentation" — 🟠
    "17 minutes ago"
  - ☰ "LLM application reference documentation" — 🟠 "21 hours ago"
  - 💬 "Greeting" — "yesterday"
  - 💬 "how much time it will take wit…" — "Feb 8"
  - 💬 "Evaluate my coding style based on a snippet" — "Feb 1"
- **Observation:** the two rows with a task-list glyph (☰) also carry a
  colored dot next to their timestamp; plain-chat rows (💬) do not. This is
  the only visual marker distinguishing a Cowork "task" from an ordinary
  chat inside the unified "Chats and tasks" list.

**166 — Home → Projects (`claude-web-home-projects-how-to-use-claude-example.png`)**

- Nav: `Projects` active.
- Header "Projects", controls **Sort by Last updated ▾**, **New project**.
- Search field: "Search projects…".
- One project card: **"How to use Claude"** with badge **"Example
  project"** — body copy: "An example project that also doubles as a
  how-to guide for using Claude. Chat with it to learn more about how to
  get the most out of chatting with Claude!" — date "Jul 7".
- **Observation:** Claude ships every account a pre-seeded example project
  used as an in-product onboarding/how-to surface, not just an empty state.

**167 — Home → Artifacts, empty (`claude-web-home-artifacts-empty-state-what-will-you-build.png`)**

- Nav: `Artifacts` active.
- Header "Artifacts", controls **Filter by All ▾**, **New artifact**.
- Search field: "Search artifacts…".
- Sub-tabs: **All** (selected) | **Yours** | **Shared with you**.
- Empty state: icon of a hand pointing at a square/triangle/circle cluster;
  heading **"What will you build with artifacts?"**; body "If you can dream
  it, you can build it. Take apps, games, templates, and tools from thought
  to reality."; button **New artifact**.

**168 — Home → Scheduled tasks, empty + templates (`claude-web-home-scheduled-tasks-empty-state-suggested-templates.png`)**

- Nav: `Scheduled` active.
- Header "Scheduled tasks", subtext "Run tasks on a schedule or whenever you
  need them.", controls **Sort by Next run ▾**, **New task ▾** (has a
  dropdown caret — options not shown/exercised).
- Search field: "Search scheduled tasks…".
- Empty state: stopwatch icon, text **"No scheduled tasks yet."**
- Below a dashed divider, a 2-column grid of **suggested task templates**
  (icon, title, one-line description, small clock + cadence string):
  - ☑ **Weekly review** — "A Friday summary of what happened this week." —
    🕐 Every Friday at 4:00 PM
  - 📅 **Meeting prep** — "A short brief before each meeting on your
    calendar, covering attendees, context, and agenda." — 🕐 Weekdays at
    8:00 AM
  - 📤 **Inbox triage** — "Categorize your inbox and draft replies to
    anything urgent." — 🕐 Weekdays at 8:00 AM
  - 💡 **Content ideas** — "Draft a few post ideas each week from the
    latest news in your industry." — 🕐 Every Monday at 9:00 AM
  - ☀️ **Daily briefing** — "What needs your attention today across
    calendar, email, and messages." (cadence text cut off at screenshot
    bottom — not visible)
  - 🔍 **Monitor a topic** — "Watch for news or mentions of a topic,
    competitor, or keyword." (cadence text cut off — not visible)

### Home launcher — chat vs. cowork mode switch (narrower shell, no sidebar)

**181 — Cowork mode, pinned session (`claude-web-home-launcher-cowork-mode-pinned-session.png`)**

- Top bar: panel-toggle icon (blue unread dot), right-aligned "☁ Beta" label.
- Greeting headline: "🌟 Burning the midnight tokens" (a whimsical/rotating
  greeting string, not a fixed "Good evening").
- Usage banner directly above the composer: **"You've used 75% of your
  weekly limit"** with a right-aligned **"Get more usage"** link and a
  dismiss ✕.
- Composer input placeholder: **"Type / for skills"**.
- Composer bottom row: `+` (attach), mode toggle **Chat | Cowork** (Cowork
  selected/pilled), right-aligned model picker **"Sonnet 5 Max ▾"**, mic
  icon.
- Second row below composer: **"🗂 Project or folder ▾"** picker, **"⚠
  Skip ▾"** (a permission-mode dropdown), right-aligned **"⚡ 2× more usage
  until August 5"**.
- Below that: section label **"Pinned or active"** with a right-aligned
  **"Clear active"** link, then one row: ☰ "LLM application reference
  documentation" — "22 hours ago" (blue unread dot).

**182 — Chat mode, quick actions (`claude-web-home-launcher-chat-mode-quick-actions.png`)**

- Same shell; top-right icon here is a ghost/skull-like glyph instead of
  "Beta" text — unclear what state this represents; not confirmed.
- Same greeting: "🌟 Burning the midnight tokens".
- Composer placeholder: **"How can I help you today?"** (differs from
  Cowork's "Type / for skills").
- Composer bottom row: `+`, mode toggle **Chat** (selected) **| Cowork**,
  right-aligned **"Sonnet 5 Max ▾"**, mic icon, plus one more icon
  (vertical bars, resembling a voice/waveform control) not present in the
  Cowork-mode row.
- Below composer: a row of 5 quick-action pills — **`</> Code`**,
  **`🖊 Write`**, **`🎓 Learn`**, **`☕ Life stuff`**, **`💡 Claude's
choice`**.
- **Observation (mode-switch delta):** switching Chat → Cowork changes (a)
  the input placeholder, (b) replaces the 5 quick-action pills with a
  Project/folder picker + permission-mode dropdown + usage-multiplier note,
  and (c) reveals a "Pinned or active" sessions list under the composer.
  The 75%-of-weekly-limit usage banner only appears in the Cowork
  screenshot of this pair — Cowork usage appears to be surfaced more
  proactively pre-send than Chat usage, though this is drawn from a single
  paired comparison and could be coincidental (limit was already at 75%
  regardless of mode).

### Claude Code (web) — "Code" tab

**169 — Code tab setup, download CTA (`claude-web-code-tab-setup-download-desktop-app-cta.png`)**

- Left rail differs from the Home tab: **Home | Code** tabs, then `+ New`,
  `Artifacts`, `Customize`, `More ⌄` (no Chats-and-tasks/Projects/Scheduled
  — those are Home-only nav concepts). Below the rail: "Sessions you start
  will show up here" + a faded pixel-art icon. Bottom of sidebar: a
  dismissible "Try the Slack app" banner with **Install** link, then account
  row "Siddhartha · Max ▾".
- Main heading: **"Set up and start coding"**, subtext "Install the desktop
  app, or pick where you want to start."
- Card: **"Claude Code app"** — "Write code, review diffs, and merge PRs,
  all in one place." — an inline screenshot preview of a diff view (Files
  Changed 3, sample "Zoo Exhibit Registry" code) — button **"🍎 Download for
  macOS"**.
- Row of secondary entry-point pills below the card: **Terminal**, **VS
  Code**, **JetBrains**, **Mobile**, **Slack** (each with its own icon).
- Footer: "Want to set up apps later?" → button **"Continue on web →"**.

**170 — Onboarding wizard: "Code with Claude anywhere" (`claude-web-code-onboarding-wizard-code-with-claude-anywhere.png`)**

- Full-bleed wizard screen (sidebar gone). Top-left "Claude Code" wordmark,
  "← Back" link.
- Heading **"Code with Claude anywhere"**, subtext "Get set up to code on
  any device."
- Card with 3 bulleted benefit rows:
  - ☁ "Run Claude and your code in the cloud. No worktrees or local
    cloning."
  - 🛡 "Configure a secure environment in just a few clicks."
  - 🗂 "Pick up any session from anywhere — browser, terminal, or mobile."
- Button: **"Get started"** (full-width).

**171 — Onboarding wizard: "Connect your terminal" (`claude-web-code-onboarding-wizard-connect-your-terminal.png`)**

- Heading **"Connect your terminal"**, subtext "Already have Claude Code?
  You're one command away."
- Terminal-window mock titled `claude — zsh`, contents: `✱ Welcome to Claude
Code`, `cwd: ~/projects`, prompt `> /web-setup`.
- Instruction: "Open Claude Code and run `/web-setup` to connect."
- Link: **"Connect a different way"**.

**172 — Onboarding wizard: "Connect with GitHub" (`claude-web-code-onboarding-wizard-connect-with-github.png`)**

- Heading **"Connect with GitHub"**, subtext "Choose how to connect your
  repositories."
- Two-column choice card:
  - Left, badge **"More flexible"** — 🔑 **"Personal access token"** —
    "Works immediately with every repository you already have access to.
    Generate a token on github.com and paste it here." — button **"Get a
    token on github.com ↗"**.
  - Right, badge **"Fewer steps"** — 🐙 **"Sign in with GitHub"** — "Sign in
    with your GitHub account in one click. Org-owned repos may require
    admin approval." — button **"Continue with GitHub"** (primary/white).
- Link: **"Skip this step"**.
- **Observation:** 171 and 172 both present a "Back"-able standalone step
  and 171 offers "Connect a different way" — these read as two _alternative_
  connection paths (terminal-first vs. GitHub-first) inside the same wizard
  flow, not strictly sequential steps 2-then-3. Presenting this as the
  observed structure rather than asserting a fixed linear order.

**173 — Onboarding wizard: "Create your first cloud environment" (`claude-web-code-onboarding-wizard-create-cloud-environment.png`)**

- Heading **"Create your first cloud environment"**, subtext "Create your
  default cloud environment and control Claude's network access. Customize
  and create new environments anytime in settings."
- Field **"Name"** — text input, value "Default".
- Section **"Network access"** — subtext "Learn more about our network
  policy and access levels." (both are inline links).
- Three selectable option cards:
  - 🖐 **"None"** — "Blocks internet access for maximum security."
  - 🛡 **"Trusted"** badge **"Recommended"** — "Downloads packages from
    verified sources."
  - 🌐 **"Full"** — "Unrestricted internet access for maximum flexibility."
- Button: **"Create & finish"**.

**174 — Code home, empty state greeting (`claude-web-code-home-empty-state-greeting.png`)**

- Left rail: `New`, `Artifacts`, `Customize`, `More ⌄` (post-onboarding
  state — download banner is gone from earlier capture's version; a
  "Try the Slack app" banner is still present here at the bottom).
- Greeting: "🌟 What's up next, Siddhartha?"
- Composer bottom bar: **"☁ Default"** pill (cloud environment selector),
  **"+ Select repo…"** pill, input placeholder "Describe a task or ask a
  question", send icon.
- Below-input control row: **"Accept edits"** (a permission-mode label)
  with `+` and mic/chevron icons, right-aligned **"Opus 4.8"** (model
  label), **"High"** (an effort/thinking-level label), and a small circular
  status/progress icon.
- A small orange pixel-art creature icon floats near the composer
  (decorative mascot, not a control).

**175 — Code home, "More" menu open (`claude-web-code-home-more-menu-open.png`)**

- Identical screen to 174 with the sidebar's `More` item expanded into a
  flyout:
  - ⚡ **Routines**
  - 🗄 **Dispatch** — badge **"Beta"**
  - — divider —
  - ⚙ **Customize sidebar**

**176 — Sidebar customize modal (`claude-web-sidebar-customize-modal-artifacts-routines-dispatch.png`)**

- Modal **"Customize sidebar"**, close ✕, subtext "Choose which items
  appear in your sidebar."
- Checkbox list:
  - ☑ 🔗 **Artifacts** (checked)
  - ☐ ⚡ **Routines** (unchecked)
  - ☐ 🗄 **Dispatch** (unchecked)
  - ☑ 💼 **Customize** (checked)
- Button: **"Done"**.
- **Observation:** this is the IA control surface for the Code tab's
  left rail. Artifacts and Customize are the default-on optional items;
  Routines and Dispatch are opt-in and off by default. This confirms
  Dispatch is consistently Beta-labeled everywhere it appears (menu row
  175, this checkbox, and the always-visible "Dispatch Beta" nav item seen
  faded in the Home tab's own sidebar in image 165's background list). Only
  the **Code tab's** version of this modal was captured — whether Home tab
  has an equivalent "customize sidebar" control for its own nav
  (Chats/Projects/Artifacts/Scheduled) is not covered by these captures.

### Cowork task detail

**183 — Cowork task outputs: benchmark spec files (`claude-web-cowork-task-outputs-benchmark-spec-files.png`)**

- Header breadcrumb: panel-toggle icon, cloud icon, task title "LLM
  application reference documentation ▾" (chevron implies a rename/menu).
- Main transcript area lists generated documents as rows (top row "01
  mobile benchmark spec" is partially cut off/scrolled past):
  - "02 website benchmark spec" — "Document · MD" — button **"🅰 Download
    and open ▾"**
  - "03 desktop benchmark spec" — same row pattern
  - "04 cli benchmark spec" — same
  - "05 chrome extension benchmark spec" — same
  - "06 vscode extension benchmark spec" — same
  - "07 shared platform benchmark spec" — same
  - (each "Download and open" button has a trailing chevron, implying a
    split-button with more options — the menu itself was not opened in
    this capture, so its contents are not confirmed)
- Below the list: a small icon row (🖥 preview/screen icon, 🔊 read-aloud,
  👍 thumbs-up, 👎 thumbs-down), then the Claude sunburst mark alone
  (task-complete indicator).
- Usage banner: **"You've used 75% of your weekly limit"** / **"Get more
  usage"** / dismiss ✕ — same banner as seen in the Cowork launcher (181).
- Composer: placeholder "Write a message…", `+` attach, **"🗂 Skip ▾"**
  (permission mode), right-aligned **"Sonnet 5 Max ▾"**, mic icon.
- Footer disclaimer: "Claude is AI and can make mistakes. Please
  double-check responses. Give us feedback".
- **Right-hand persistent task panel** (this is the structurally
  interesting part):
  - **"Progress ›"** — collapsed/collapsible section header.
  - **"Outputs 7 ⌄"** — a flat list of the 7 generated `.md` files, each
    with an "MD" file-type badge icon: `05-chrome-extension-benchmark…`
    (truncated), `01-mobile-benchmark-spec.md`, `02-website-benchmark-
spec.md`, `07-shared-platform-benchmark-s…` (truncated),
    `03-desktop-benchmark-spec.md`, `04-cli-benchmark-spec.md`,
    `06-vscode-extension-benchmark-…` (truncated).
    **Note:** this Outputs-panel order does not match the numeric order of
    the same files as listed in the main transcript (02, 03, 04, 05, 06,
    07…) — the side panel appears sorted by something other than filename
    (e.g. generation/completion order), which is a minor UX inconsistency
    worth flagging if we build an equivalent feature.
  - **"Context ⌄"** section, with two small icons top-right (a folder-add
    icon and a desktop/computer icon — plausibly "attach a folder" and
    "open in Finder/local app", not exercised/confirmed) and a breadcrumb
    row of folder icons ending in a folder named `claude_application_b…`
    (truncated).

### Settings — reached via a modal overlay (same modal shape from both Home and Code tabs)

The Settings modal has a fixed left rail with three labeled groups
(**Settings**, **Desktop app**, **Customize**) and a search field at the
very top. This exact rail (all 14 items) recurs identically in every
settings screenshot in this set (157–161, 177–180); only the highlighted
item and the blurred background (showing whichever tab — Home or Code — the
modal was opened from) differ.

**157 — Desktop app → Extensions (`claude-web-settings-extensions-desktop-installed-list.png`)**

- Header "Extensions", subtext "Allow Claude to directly interact with
  apps, data, and tools on your computer.", button **"Browse extensions"**.
- Section label **"Installed on your computer"**.
- Row list (icon, name, **Configure** button, **…** overflow menu), in
  order: Filesystem, Excel (By Anthropic), Read and Write Apple Notes,
  Apify, Control your Mac, Tableau, Desktop Commander, Context7.
- Bottom button: **"Advanced settings"**.
- Footer hint: "💡 Drag .MCPB or .DXT files here to install".

**158 — Desktop app → Developer, Filesystem detail (`claude-web-settings-developer-mcp-filesystem-server-detail.png`)**

- Header "Local MCP servers", subtext "Add and manage MCP servers that
  you're working on.", button **"Edit Config"**.
- Two-pane layout: left, a server list (Filesystem selected/highlighted,
  Excel (By Anthropic), Read and Write Ap…, Apify, Control your Mac,
  Context7); right, detail for **Filesystem**:
  - Title "Filesystem" + badge **"running"**.
  - "This server is managed by an extension."
  - **Command:** `node`
  - **Arguments:** `/Users/siddhartha/Library/Application
Support/Claude/Claude Extensions/ant.dir.ant.anthropic.filesystem/dist/
index.js /Users/siddhartha/Desktop`
  - Button: **"View Logs"**.
- **Capability note:** confirms extensions are implemented as local MCP
  servers under the hood — the "Developer" tab exposes the raw command/args
  of an entry that also appears as a friendly "Extension" card in 157. The
  filesystem server's argument list is scoped to a specific local directory
  (`/Users/siddhartha/Desktop`), i.e. filesystem access is directory-scoped,
  not full-disk by default.

**159 — Customize → Skills, installed table (`claude-web-settings-skills-morning-skill-creator-installed.png`)**

- Header "Skills", search icon, **Browse** button, **Add ▾** button.
- Table columns: **Skill | Last updated | Author**.
- Rows: `morning` — 7/21/26 — Anthropic; `skill-creator` — 7/21/26 —
  Anthropic.

**160 — Customize → Connectors, from Home tab context (`claude-web-settings-connectors-desktop-connectors-status-list.png`)**

- Header "Connectors", search icon, **Add ▾**.
- Tabs: **All** (selected) | Connected | Not connected.
- Section **"POPULAR"**: three cards — Gmail (**Connect**), Google Drive
  (**Connect**), Slack (**Connect**).
- Table columns: **Connector | Type | Status**.
- Rows (name — Type — Status, ✓ = connected checkmark, — = not connected,
  button = actionable):
  - Apify — Desktop — ✓
  - Claude in Chrome — Desktop, badge **"Included"** — ✓
  - Context7 — Desktop — ✓
  - Control your Mac — Desktop — ✓
  - Excel (By Anthropic) — Desktop — ✓
  - Filesystem — Desktop — ✓
  - Read and Write Apple Notes — Desktop — ✓
  - Desktop Commander — Desktop — — (not connected)
  - GitHub Integration — Web — button **Connect**
  - Tableau — Desktop — — (not connected)

**161 — Customize → Plugins, empty (`claude-web-settings-plugins-empty-state-browse-cta.png`)**

- Header "Plugins", search icon, **Browse** button, **Add ▾**.
- Center empty state: plugin/building-blocks icon, text **"Give Claude
  role-level expertise with plugins"**, button **"Browse plugins"**.

**177 — Settings → Claude Code (`claude-web-settings-panel-claude-code-appearance-prefs.png`)**

- Section **"General"**:
  - Toggle **"Classify session states"** (ON) — "Allow Claude to
    automatically classify sessions as blocked, ready for review, or done.
    Classifying sessions counts towards your plan usage. Applies to new
    sessions."
  - Toggle **"Switch models when a message is flagged"** (ON) — "When
    safety measures flag a message, automatically switch to a different
    model to keep chatting. When off, your session will pause instead.
    Applies to web and remote sessions."
- Section **"Code appearance"**:
  - Two side-by-side theme dropdowns, each with a live code-diff preview
    of a sample `greet(name: string)` function (red/green diff lines):
    **"Claude Light"** and **"Claude Dark"**.
  - Field **"Code font"** — "Set a custom monospace font for code and
    terminal." — text input, placeholder "e.g. JetBrains Mono".
- Section **"Appearance"**:
  - Toggle **"High-contrast dark theme"** (OFF) — "Use a darker, near-black
    background when dark mode is on."

**178 — Settings → Cowork (`claude-web-settings-panel-cowork-global-instructions.png`)**

- Header **"Global instructions"** — "Instructions here apply to all Cowork
  sessions. Use this for preferences, conventions, or context that Claude
  should always know." — button **"Edit"**.
- No instructions text is populated in this capture (empty/unset state);
  the editing surface itself was not opened.

**179 — Settings → Claude in Chrome (`claude-web-settings-panel-claude-in-chrome-permissions.png`)**

- Header **"Claude in Chrome settings"** badge **"Beta"**.
- Toggle **"Enable Claude in Chrome"** (ON) — "Use Claude in your browser
  with the Claude in Chrome extension. This setting only affects the
  extension."
- Section **"Site permissions"** — "These permissions apply to Claude in
  Chrome and the in-app Browser in Claude Code Desktop."
- Row **"Default for all sites"** — "Choose whether Claude works on all
  sites by default" — dropdown **"Select default policy ▾"** (options not
  opened/visible).

**180 — Settings → Connectors, from Code tab context (`claude-web-settings-panel-connectors-list.png`)**

- Same header/tabs/POPULAR layout as 160 (Gmail/Google Drive/Slack, all
  showing **Connect**).
- Table: only **one** row — GitHub Integration — Web — button **Connect**.
- **Discrepancy vs. 160:** none of the Desktop connectors (Apify, Context7,
  Filesystem, etc.) that appear already-connected in 160 appear here at
  all. This could mean the Code tab's Connectors panel is scoped
  differently (e.g. filtered to connectors relevant to coding/Web only), or
  this capture is from a different account/session state than 160. Not
  resolved by the evidence; flagged as-is rather than reconciled.

### Directories — full-screen "Directory" modal (separate from the Settings modal)

All three directory screenshots share one modal shell: title **"Directory"**
top-left, close ✕ top-right, a left nav with three icon items (**Skills**,
**Connectors**, **Plugins**), a top search bar, one or more filter-chip
pills, and right-aligned **"Filter by ▾"** / **"Sort by ▾"** controls (plus
a bare **"+"** icon in the Plugins directory only).

**162 — Plugin directory (`claude-web-plugin-directory-browse-anthropic-category-cards-grid.png`)**

- Left nav: **Plugins** active.
- Search: "Search plugins…".
- Filter chips: **Anthropic** (selected) | Partners.
- Extra control: a bare **"+"** icon next to Filter by/Sort by (purpose not
  exercised/confirmed).
- 2-column card grid; each card = icon, title, "Anthropic • ↓<downloads>",
  truncated description, **+** add button:
  - **Productivity** — ↓1.8M — "Manage tasks, plan your day, and build up
    memory of important context about your work. Syncs with your…"
  - **Design** — ↓1.6M — "Accelerate design workflows — critique, design
    system management, UX writing, accessibility audits, research…"
  - **Marketing** — ↓1.4M — "Create content, plan campaigns, and analyze
    performance across marketing channels. Maintain brand voice…"
  - **Engineering** — ↓1.2M — "Streamline engineering workflows — standups,
    code review, architecture decisions, incident response, and…"
  - **Data** — ↓1.2M — "Write SQL, explore datasets, and generate insights
    faster. Build visualizations and dashboards, and turn raw data in…"
  - **Finance** — ↓1.1M — "Streamline finance and accounting workflows,
    from journal entries and reconciliation to financial statements and…"
  - **Product Management** — ↓1M — "Write feature specs, plan roadmaps, and
    synthesize user research faster. Keep stakeholders updated and stay…"
  - **PDF Viewer** — ↓960.9K — "View, annotate, and sign PDFs in a live
    interactive viewer. Mark up contracts, fill forms with visual
    feedback, stamp…"
  - **Sales** — ↓945.3K — "Prospect, craft outreach, and build deal
    strategy faster. Prep for calls, manage your pipeline, and write…"
  - **Operations** — ↓936.7K — "Optimize business operations — vendor
    management, process documentation, change management, capacity…"
- **Key IA observation:** every plugin card in the Anthropic tab is a
  _role/domain bundle_ (Design, Engineering, Sales, Finance…), not a single
  narrow tool. Plugins = packaged, role-level expertise sets. A "Partners"
  tab exists but its contents were not captured.

**163 — Connector directory (`claude-web-connector-directory-browse-popular-and-community-cards.png`)**

- Left nav: **Connectors** active.
- Search: "Search connectors…".
- Filter chip: **"Anthropic & Partners"** (single pill, selected — no
  separate "Community" chip visible, even though individual cards below
  carry a "Community" badge).
- Section **"POPULAR"**: Gmail (+), Google Drive (+), Slack (+).
- 2-column card grid; each card = icon, name, badge(s), one-line
  description, **+** button:
  - **Aha!** — badges **New**, **Community** — "Bring product strategy and
    planning data into Claude"
  - **LogRocket MCP** — badges **New**, **Community** — "Catch issues and
    understand customer behavior"
  - **Unstructured Transform** — badges **New**, **Community** — "Turn any
    document into AI-ready structured data"
  - **Gmail** — verified checkmark badge, **"#2 popular"** — "Draft
    replies, summarize threads, & search your inbox"
  - **Google Drive** — verified checkmark, **"Most popular"** — "Search,
    read, and upload files instantly"
  - **Canva** — verified checkmark, **"#4 popular"** — "Search, create,
    autofill, and export Canva designs"
  - **Geckoboard** — badges **New**, **Community** — "Get accurate answers
    about your business metrics in Claude"
  - **Google Calendar** — verified checkmark, **"#3 popular"** — "Manage
    your schedule and coordinate meetings effortlessly"
  - **Figma** — verified checkmark, **"#5 popular"** — description cut off
    at bottom of screenshot, not visible.
  - **TravExp** — badges **New**, **Trending** (with an up-arrow glyph),
    **Community** — description cut off, not visible.
- **Key IA observation:** connector cards carry an explicit trust/provenance
  signal (a verified checkmark for Anthropic/first-party vs. a
  "Community" text badge for third-party-submitted ones) plus a numeric
  popularity rank ("#2 popular" etc.) directly on the card — this doesn't
  show up in any web marketing page and is only visible in-product.

**164 — Skill directory (`claude-web-skill-directory-browse-anthropic-skills-cards-grid.png`)**

- Left nav: **Skills** active.
- Search: "Search skills…".
- Filter chip: **Anthropic** (selected — no visible "Partners"/"Community"
  chip for skills, unlike Plugins).
- 2-column card grid; each card = **"/slug-name"** title (slash-command
  style), "Anthropic • ↓<downloads>", truncated description, and an action
  icon top-right — a **gear ⚙** if already installed/configurable, a
  **+** if not yet added:
  - **/skill-creator** — ↓129.8K — ⚙ (installed) — "Create new skills,
    modify and improve existing skills, and measure skill performance. Use
    when users want to crea…"
  - **/morning** — ↓1.7K — ⚙ (installed) — "Render the user's morning
    brief as a styled HTML artifact, or set it up as a recurring weekday
    task. Use only when t…"
  - **/canvas-design** — ↓1.6M — + — "Create beautiful visual art in .png
    and .pdf documents using design philosophy. You should use this skill
    when t…"
  - **/web-artifacts-builder** — ↓1M — + — "Suite of tools for creating
    elaborate, multi-component claude.ai HTML artifacts using modern
    frontend web…"
  - **/mcp-builder** — ↓831.7K — + — "Guide for creating high-quality MCP
    (Model Context Protocol) servers that enable LLMs to interact with…"
  - **/theme-factory** — ↓799.7K — + — "Toolkit for styling artifacts with
    a theme. These artifacts can be slides, docs, reportings, HTML landing
    pages, etc.…"
  - **/brand-guidelines** — ↓726.1K — + — "Applies Anthropic's official
    brand colors and typography to any sort of artifact that may benefit
    from having…"
  - **/doc-coauthoring** — ↓706K — + — "Guide users through a structured
    workflow for co-authoring documentation. Use when user wants to
    write…"
  - **/learn** — ↓671.9K — + — "Use this skill when the user wants
    intellectual understanding — learning how or why something works,…"
  - **/internal-comms** — ↓546.5K — + — "A set of resources to help me
    write all kinds of internal communications, using the formats that my
    company lik…"
- **Key IA observation:** skills are named and surfaced as literal
  slash-commands (`/skill-creator`, `/morning`, …), matching the "Type / for
  skills" placeholder seen in the Cowork composer (181) — invocation syntax
  and directory naming are the same string. The two skills the user has
  actually installed (`morning`, `skill-creator`) are exactly the same two
  rows shown in the Settings → Skills table (159), confirming the
  Settings-table view and the Directory-grid view are two renderings of the
  same underlying installed/available skill set, with the gear-vs-plus icon
  as the sole "is this installed" signal in the directory grid.

---

## Full navigation / settings tree (reconstructed from what was seen)

```
claude.ai (web)
├── Home tab
│   ├── + New
│   ├── Chats and tasks        (unified list; task rows carry a colored status dot; chat rows don't)
│   │     [Select] [Filter by All ▾] [New]
│   ├── Projects
│   │     [Sort by Last updated ▾] [New project]
│   │     └── "How to use Claude" (seeded Example project)
│   ├── Artifacts
│   │     [Filter by All ▾] [New artifact]
│   │     tabs: All | Yours | Shared with you
│   ├── Scheduled                (= "Scheduled tasks")
│   │     [Sort by Next run ▾] [New task ▾]
│   │     empty-state templates: Weekly review · Meeting prep · Inbox triage ·
│   │                            Content ideas · Daily briefing · Monitor a topic
│   ├── Customize                (opens a panel — contents not captured for Home tab)
│   ├── Dispatch  [Beta]         (present as a nav item in Home tab's own rail per background evidence; not opened)
│   └── account row: "<name> · <plan> ▾"  +  download icon
│
├── Code tab
│   ├── + New
│   ├── Artifacts
│   ├── Customize
│   └── More ▾
│         ├── Routines
│         ├── Dispatch  [Beta]
│         └── Customize sidebar…  → modal: checkboxes for
│               ☑ Artifacts  ☐ Routines  ☐ Dispatch  ☑ Customize   [Done]
│   First-run / setup:
│     "Set up and start coding" → Claude Code app (Download for macOS) |
│       Terminal | VS Code | JetBrains | Mobile | Slack | "Continue on web →"
│   4-step-ish onboarding wizard (terminal and GitHub are alternative branches):
│     1. "Code with Claude anywhere" → [Get started]
│     2a. "Connect your terminal" → run /web-setup   (or "Connect a different way")
│     2b. "Connect with GitHub" → Personal access token | Sign in with GitHub  (or "Skip this step")
│     3. "Create your first cloud environment"
│          Name: [Default]
│          Network access: None | Trusted (Recommended) | Full
│          [Create & finish]
│   Home/empty state: "What's up next, <name>?"
│     composer: [☁ Default env ▾] [+ Select repo…] [Describe a task or ask a question]
│     sub-row: [Accept edits ▾] … model "Opus 4.8"  effort "High"
│
├── Home launcher (compact/no-sidebar surface — relationship to Home tab unconfirmed)
│     greeting: "🌟 <rotating phrase>"
│     mode toggle: Chat | Cowork
│       Chat:   placeholder "How can I help you today?"
│              quick actions: </> Code · 🖊 Write · 🎓 Learn · ☕ Life stuff · 💡 Claude's choice
│       Cowork: placeholder "Type / for skills"
│              row: 🗂 Project or folder ▾   ⚠ Skip ▾   "2× more usage until <date>"
│              "Pinned or active" list + "Clear active"
│     usage banner (seen in Cowork state): "You've used 75% of your weekly limit" [Get more usage] [✕]
│     model picker: "Sonnet 5  Max ▾"  (both modes)
│
├── Cowork task detail (opened from a task row)
│     header: <task title> ▾
│     transcript: generated docs as rows — "Document · MD" — [Download and open ▾]
│     right panel: Progress ›  |  Outputs N ⌄ (per-file MD icons)  |  Context ⌄ (folder breadcrumb + attach icons)
│     composer: [+] [🗂 Skip ▾] … "Sonnet 5  Max ▾"
│
├── Settings (modal, reachable from either tab; same rail both times)
│     [Search]
│     Settings
│       ├── General
│       ├── Account
│       ├── Privacy
│       ├── Billing
│       ├── Usage
│       ├── Capabilities
│       ├── Claude Code
│       │     General: Classify session states (toggle) · Switch models when a message is flagged (toggle)
│       │     Code appearance: Claude Light / Claude Dark theme pickers w/ live diff preview · Code font (text input)
│       │     Appearance: High-contrast dark theme (toggle)
│       ├── Cowork
│       │     Global instructions  [Edit]
│       └── Claude in Chrome  [Beta]
│             Enable Claude in Chrome (toggle)
│             Site permissions → Default for all sites [Select default policy ▾]
│     Desktop app
│       ├── General          (not captured)
│       ├── Extensions
│       │     [Browse extensions]
│       │     Installed on your computer: Filesystem · Excel (By Anthropic) ·
│       │       Read and Write Apple Notes · Apify · Control your Mac ·
│       │       Tableau · Desktop Commander · Context7   (each: [Configure] […])
│       │     [Advanced settings]   "Drag .MCPB or .DXT files here to install"
│       └── Developer
│             Local MCP servers  [Edit Config]
│             per-server detail: status badge (e.g. "running"), Command, Arguments, [View Logs]
│     Customize
│       ├── Skills      table: Skill | Last updated | Author   [Browse] [Add ▾]
│       ├── Connectors  tabs: All | Connected | Not connected
│       │     POPULAR: Gmail · Google Drive · Slack (each [Connect])
│       │     table: Connector | Type | Status            [Add ▾]
│       └── Plugins     empty state: "Give Claude role-level expertise with plugins"  [Browse plugins]
│
└── Directory (separate full-screen modal, NOT the same as Settings)
      left nav: Skills | Connectors | Plugins
      [Search …]  [Filter by ▾] [Sort by ▾]
      Skills:      chip "Anthropic"              → /slug-name cards, ⚙ installed / + not installed
      Connectors:  chip "Anthropic & Partners"    → POPULAR row + cards w/ New/Community/verified/#N popular/Trending badges
      Plugins:     chips "Anthropic" | "Partners" → role-bundle cards (Productivity, Design, Marketing, Engineering, Data, Finance, Product Management, PDF Viewer, Sales, Operations)
```

---

## Control inventory table

| Screen                             | Control                                             | Type                          | What it appears to do                                                                  |
| ---------------------------------- | --------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| Chats and tasks (165)              | Select                                              | Button                        | Enter multi-select mode for bulk actions on rows (not exercised)                       |
| Chats and tasks (165)              | Filter by All ▾                                     | Dropdown                      | Filter the unified list (likely by Chats/Tasks; options unseen)                        |
| Chats and tasks (165)              | New                                                 | Button (primary)              | Start a new chat or task                                                               |
| Chats and tasks (165)              | Search chats and tasks…                             | Text input                    | Filters the list below by query                                                        |
| Projects (166)                     | Sort by Last updated ▾                              | Dropdown                      | Reorders project cards                                                                 |
| Projects (166)                     | New project                                         | Button (primary)              | Creates a new project                                                                  |
| Artifacts (167)                    | Filter by All ▾                                     | Dropdown                      | Filters artifact list                                                                  |
| Artifacts (167)                    | New artifact                                        | Button (primary)              | Creates a blank artifact                                                               |
| Artifacts (167)                    | All / Yours / Shared with you                       | Tabs                          | Scopes the artifact list by ownership                                                  |
| Scheduled (168)                    | Sort by Next run ▾                                  | Dropdown                      | Reorders scheduled tasks by next execution                                             |
| Scheduled (168)                    | New task ▾                                          | Split button                  | Creates a scheduled task; caret implies template options                               |
| Scheduled (168)                    | template cards (Weekly review, etc.)                | Clickable cards               | Pre-fills a new scheduled task from a template                                         |
| Launcher (181/182)                 | Chat / Cowork                                       | Segmented toggle              | Switches composer mode; changes placeholder, sub-controls, and visible sections        |
| Launcher (181)                     | Project or folder ▾                                 | Dropdown                      | Scopes a Cowork session to a repo/folder                                               |
| Launcher (181)                     | Skip ▾ (⚠ icon)                                     | Dropdown                      | Permission/approval mode for the session (e.g. auto-accept level)                      |
| Launcher (181/182)                 | Sonnet 5 Max ▾                                      | Dropdown                      | Model + reasoning-effort/tier picker                                                   |
| Launcher (181)                     | Clear active                                        | Link                          | Clears the "Pinned or active" session list                                             |
| Launcher (182)                     | Code / Write / Learn / Life stuff / Claude's choice | Pills                         | Quick-start prompt categories for Chat mode                                            |
| Code tab setup (169)               | Download for macOS                                  | Button (primary)              | Downloads the Claude Code desktop app                                                  |
| Code tab setup (169)               | Terminal / VS Code / JetBrains / Mobile / Slack     | Pills                         | Alternate entry points into Claude Code                                                |
| Code tab setup (169)               | Continue on web →                                   | Button                        | Skips app installation, proceeds in-browser                                            |
| Onboarding step 1 (170)            | Get started                                         | Button (primary)              | Advances the wizard                                                                    |
| Onboarding step: terminal (171)    | Connect a different way                             | Link                          | Branches to the GitHub-connection path instead                                         |
| Onboarding step: GitHub (172)      | Get a token on github.com ↗                         | External link/button          | Opens GitHub token-creation page                                                       |
| Onboarding step: GitHub (172)      | Continue with GitHub                                | Button (primary)              | OAuth sign-in with GitHub                                                              |
| Onboarding step: GitHub (172)      | Skip this step                                      | Link                          | Bypasses GitHub connection                                                             |
| Onboarding step: environment (173) | Name                                                | Text input                    | Names the cloud environment (default "Default")                                        |
| Onboarding step: environment (173) | None / Trusted / Full                               | Selectable cards              | Sets network-access policy for the sandbox; "Trusted" is pre-marked Recommended        |
| Onboarding step: environment (173) | Create & finish                                     | Button (primary)              | Provisions the environment and completes onboarding                                    |
| Code home (174)                    | Default ▾ (☁)                                       | Dropdown/pill                 | Selects active cloud environment                                                       |
| Code home (174)                    | Select repo…                                        | Pill button                   | Attaches a GitHub repo to the session                                                  |
| Code home (174)                    | Accept edits ▾                                      | Dropdown                      | Sets the auto-apply/permission mode for code edits                                     |
| Code home (174)                    | Opus 4.8 / High                                     | Labels                        | Shows active model and effort/thinking level (not confirmed clickable in this capture) |
| Code home more menu (175)          | Routines                                            | Nav item                      | Opens Routines (not captured further)                                                  |
| Code home more menu (175)          | Dispatch (Beta)                                     | Nav item                      | Opens Dispatch, a beta feature (not captured further)                                  |
| Code home more menu (175)          | Customize sidebar…                                  | Nav item                      | Opens the sidebar-customize modal                                                      |
| Customize sidebar modal (176)      | Artifacts / Routines / Dispatch / Customize         | Checkboxes                    | Toggles which optional items show in the Code tab's left rail                          |
| Customize sidebar modal (176)      | Done                                                | Button (primary)              | Saves and closes the modal                                                             |
| Cowork task (183)                  | Download and open ▾                                 | Split button (per output row) | Downloads a generated file and opens it; caret implies more options (unconfirmed)      |
| Cowork task (183)                  | Progress ›                                          | Collapsible section           | Presumably shows step-by-step task progress (not expanded in capture)                  |
| Cowork task (183)                  | Outputs N ⌄                                         | Collapsible list              | Lists all generated files for the task, each downloadable                              |
| Cowork task (183)                  | Context ⌄                                           | Collapsible section           | Shows the folder/context attached to the task; has folder-add and desktop-open icons   |
| Settings → Extensions (157)        | Browse extensions                                   | Button                        | Opens the extension/connector directory                                                |
| Settings → Extensions (157)        | Configure (per row)                                 | Button                        | Opens per-extension configuration                                                      |
| Settings → Extensions (157)        | … (per row)                                         | Overflow menu                 | Presumably remove/disable/view details (not opened)                                    |
| Settings → Extensions (157)        | Advanced settings                                   | Button                        | Reveals more granular extension settings (not opened)                                  |
| Settings → Developer (158)         | Edit Config                                         | Button                        | Opens raw MCP server config for editing                                                |
| Settings → Developer (158)         | View Logs                                           | Button                        | Opens logs for the selected local MCP server                                           |
| Settings → Skills (159)            | Browse                                              | Button                        | Opens the Skill directory modal                                                        |
| Settings → Skills (159)            | Add ▾                                               | Split button                  | Adds a skill (manually or via directory; options unconfirmed)                          |
| Settings → Connectors (160/180)    | All / Connected / Not connected                     | Tabs                          | Filters the connector table by connection status                                       |
| Settings → Connectors (160/180)    | Connect (per popular card / row)                    | Button                        | Initiates connecting that service                                                      |
| Settings → Plugins (161)           | Browse plugins                                      | Button                        | Opens the Plugin directory modal                                                       |
| Settings → Claude Code (177)       | Classify session states                             | Toggle (ON)                   | Auto-classifies Code sessions as blocked/ready-for-review/done; consumes plan usage    |
| Settings → Claude Code (177)       | Switch models when a message is flagged             | Toggle (ON)                   | Auto-switches model on safety flag instead of pausing the session                      |
| Settings → Claude Code (177)       | Claude Light / Claude Dark                          | Dropdowns w/ live preview     | Sets syntax-highlight theme for code blocks/terminal, previewed inline                 |
| Settings → Claude Code (177)       | Code font                                           | Text input                    | Sets a custom monospace font                                                           |
| Settings → Claude Code (177)       | High-contrast dark theme                            | Toggle (OFF)                  | Darkens the dark-mode background further                                               |
| Settings → Cowork (178)            | Edit                                                | Button                        | Opens the global-instructions editor for all Cowork sessions                           |
| Settings → Claude in Chrome (179)  | Enable Claude in Chrome                             | Toggle (ON)                   | Master on/off for the Chrome extension                                                 |
| Settings → Claude in Chrome (179)  | Select default policy ▾                             | Dropdown                      | Sets the default site-permission policy                                                |
| Directory (162/163/164)            | Skills / Connectors / Plugins                       | Left nav                      | Switches directory category                                                            |
| Directory (162/163/164)            | Search …                                            | Text input                    | Filters cards by query                                                                 |
| Directory (162/163/164)            | Filter by ▾ / Sort by ▾                             | Dropdowns                     | Filters/sorts the card grid (options unconfirmed)                                      |
| Directory — Plugins (162)          | Anthropic / Partners                                | Filter chips                  | Scopes plugin cards by publisher                                                       |
| Directory — Connectors (163)       | Anthropic & Partners                                | Filter chip                   | Scopes connector cards (single combined chip)                                          |
| Directory — Skills (164)           | Anthropic                                           | Filter chip                   | Scopes skill cards to first-party                                                      |
| Directory (162/163/164)            | + (per card)                                        | Button                        | Installs/adds that plugin, connector, or skill                                         |
| Directory — Skills (164)           | ⚙ (per card, installed skills only)                 | Icon button                   | Opens config for an already-installed skill                                            |

---

## Notable design decisions

1. **One unified list for chats and agentic work.** "Chats and tasks" is a
   single view (165), not two separate sections — task rows are
   distinguished only by an icon and a colored status dot next to the
   timestamp. Cowork/task history is not siloed into its own top-level nav
   item on the Home tab.
2. **Three separate, differently-scoped directories that share one modal
   shell.** Skills, Connectors, and Plugins each get their own left-nav
   entry inside a single "Directory" overlay (162–164), but each applies a
   different filtering vocabulary: Skills uses a single "Anthropic" chip
   with slash-command names and an installed/not-installed gear-vs-plus
   glyph; Connectors uses a combined "Anthropic & Partners" chip plus a
   POPULAR strip and per-card trust badges (verified checkmark vs.
   "Community", plus numeric popularity ranks and "New"/"Trending" labels);
   Plugins uses separate "Anthropic"/"Partners" chips and packages
   functionality as role-level bundles (Design, Engineering, Sales…) rather
   than point tools. This is a real information-architecture split, not
   just three tabs of the same thing.
3. **Progressive disclosure on the Code tab's own sidebar.** The Code tab
   ships with only 4 nav items by default (New, Artifacts, Customize,
   More); Routines and Dispatch exist but are opt-in via a dedicated
   "Customize sidebar" checkbox modal (176), keeping the default surface
   minimal while still exposing power-user features one toggle away.
   Dispatch is uniformly marked "Beta" everywhere it appears.
4. **Mode-switching changes the entire composer, not just a label.**
   Chat-mode and Cowork-mode in the launcher (181/182) are not a cosmetic
   toggle — the placeholder text, the row of controls beneath the input,
   and the presence of a "Pinned or active" sessions list all change
   together. This is the clearest UI signal of "you are now starting a
   persistent agentic session" vs. "you are starting an ephemeral chat."
5. **A permission/approval-mode control is always adjacent to the model
   picker in agentic contexts.** "Skip ▾" (launcher Cowork mode, 181; task
   composer, 183) and "Accept edits ▾" (Code tab, 174) sit directly next to
   the model selector at the bottom of the compose bar in every
   code/task-capable surface — never buried in a settings screen.
6. **Extensions and local MCP servers are the same underlying object shown
   two ways.** Settings → Extensions (157) is the friendly card list;
   Settings → Developer → Local MCP servers (158) is the raw command/args
   view of the very same entries (confirmed via "Filesystem" appearing
   identically in both, with 158 noting "This server is managed by an
   extension"). This is only visible by comparing two settings screens
   side by side — no doc page states it this plainly.
7. **A seeded example project ships by default.** "How to use Claude"
   (166) exists as a permanent, non-deletable-looking onboarding artifact
   inside the real Projects list, not a dismissible tooltip or tour.
8. **Scheduled tasks' empty state doubles as a template gallery.** Rather
   than a bare "no tasks yet" message, six ready-made task templates with
   pre-set cadences (Weekly review, Meeting prep, Inbox triage, Content
   ideas, Daily briefing, Monitor a topic) are shown directly below the
   empty state (168), each naming a concrete cross-surface capability
   (calendar + email + messages access) — a discoverability mechanism for
   what scheduled tasks can actually do.
9. **Cloud environments carry a first-class network-access policy at
   creation time.** The onboarding wizard's last step (173) forces a choice
   among None / Trusted (Recommended) / Full network access before the
   first cloud sandbox is even created — security posture is not an
   afterthought buried in settings, it's step 3 of 3.

## Capabilities visible here that web documentation would not tell you

- The **exact local file-system argument scope** for the Filesystem MCP
  server (`/Users/siddhartha/Desktop`) is visible in the Developer →
  Local MCP servers detail pane (158) — confirming filesystem access is
  bound to a specific folder argument passed at process-launch time, not a
  broad "full disk" grant, and that this is inspectable/debuggable
  (Command, Arguments, View Logs) by an end user, not just Anthropic.
- The **precise verified/community/popularity signal system** used on
  connector cards (checkmark = Anthropic-verified, "Community" text badge
  = third-party, "#N popular", "New", "Trending") is only visible by
  opening the directory grid — no marketing page enumerates this badge
  taxonomy.
- **Plugins are literally role/domain bundles**, not a marketplace of small
  single-purpose tools — confirmed by the actual card set (Productivity,
  Design, Marketing, Engineering, Data, Finance, Product Management, PDF
  Viewer, Sales, Operations), each described as covering an entire
  workflow area.
- **Skills are addressed by the same slash-command string used to invoke
  them** (`/morning`, `/skill-creator`, `/canvas-design`, …) — the
  directory listing name IS the invocation syntax, visible by cross-
  referencing the Skill directory (164) against the Cowork composer
  placeholder "Type / for skills" (181).
- **Extensions register themselves as local MCP servers with a live status
  badge** ("running") and are debuggable via "View Logs" — a capability
  that only shows up by drilling into Developer settings, not from the
  friendlier Extensions list alone.
- **Session usage limits are enforced/communicated per-context, not
  globally**: the "75% of your weekly limit" banner and "2× more usage
  until <date>" note appear specifically in Cowork/task contexts (181, 183) and were not observed in the plain Chat-mode launcher (182),
  suggesting Cowork/agentic usage is metered and surfaced differently from
  ordinary chat usage.
- **Claude Code's model/effort labeling in the browser** ("Opus 4.8" /
  "High") is shown as plain text next to the compose bar (174) — screenshot
  evidence of what model-and-effort selection looks like at the point of
  use, distinct from any settings page.
- **The Code tab's onboarding explicitly frames cloud environments as
  replacing local worktrees/cloning** ("Run Claude and your code in the
  cloud. No worktrees or local cloning." — 170), and makes the network-
  access trust boundary (None/Trusted/Full) a mandatory first-run decision
  (173) rather than an advanced setting — direct evidence of how sandboxing
  is positioned to end users at the exact moment they'd care about it.
