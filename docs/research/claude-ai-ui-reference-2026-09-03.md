# claude.ai web interface reference (observed 2026-09-03)

Status: Current
Owner: Product (founder) and the parity agents
Last updated: 2026-09-03

Every statement here was observed in the founder's own signed-in claude.ai session (Max plan, one organisation, one project, about thirty chats) in Chrome on 2026-09-03. It records what is on screen, where it lives, what it does and what it talks to, so agents can build parity without re-exploring. Screenshot files referenced below live in the session capture folder (`/var/folders/9_/_g0m61810s75b_9vrd6hg_6r0000gn/T/claude-chrome-screenshots-PpPygo/screenshot-*.jpg`); the numbers are the last segment of each file name. Anything not marked observed was not opened and must not be assumed.

Vocabulary: "panel" is a page section inside the settings modal; "sheet" is a right-hand side panel inside a conversation; "popover" is a small anchored menu; "modal" is a centred dialog with a backdrop.

## 1. Application shell

Layout at 1470 px: a 296 px sidebar on the left, the main column on the right, no top bar (the page title sits inside the main column). The whole app renders on one warm off-white ground with hairline dividers; the sidebar is a slightly darker tint. Display type is a serif (page titles, greeting), body is a humanist sans, counts and dates are the body face, never mono.

### 1.1 Sidebar (top to bottom)

- Wordmark "Claude" at the top left. To its right a two-state segmented toggle: "Chat and Cowork" (speech bubbles icon) and "Code" (angle brackets icon). Code is a separate product surface; when selected it leaves the chat app. Captured 484 (tooltip "Code").
- Primary navigation: "New" (plus icon, goes to /new), "Projects" (/cowork/projects), "Artifacts" (/artifacts), "Scheduled" (/scheduled-task), "Customize" (/customize, which opens the settings modal on the Customize section).
- "Projects" header with a "+" (Create project) and the pinned or recent projects list; each row has a "More options for <name>" button.
- "Chats and tasks" header with a "Filter and group recents" button (sliders icon). The filter popover offers Type, Status, Last activity, Group by and Sort by. Chat rows are the conversation title truncated to one line with a hollow dot marker; each row has a "More options" button whose menu is Pin, Rename, Add to project, Move to group, Delete.
- Sidebar footer: "Design" (palette icon, a separate design surface), then the account row: avatar initial, first name, plan label ("Max"), a chevron that opens the account menu, and three icon buttons: "Get apps and extensions" (/downloads), "Search" (opens the search dialog), "Hide sidebar".
- Account menu (chevron): Settings, Language, Get help, Resubscribe or plan management, Get apps, Claude Academy, Learn more, Get API keys, Log out.
- Search dialog: a full-width input over the recent chats list; typing filters chats and projects; Enter opens the highlighted row.

### 1.2 Main column on /new

- Greeting in the serif face with a small orange asterisk mark: "<First name> returns!" (varies by time of day).
- The composer (section 2) centred at about 660 px wide.
- Nothing else; there are no suggestion chips on a Max account with history. Captured 484.

## 2. Composer (identical on /new, inside a chat, and inside a project)

Card with a rounded border: a single-line placeholder "How can I help you today?" that grows with content, then a bottom row.

Bottom row, left to right:

1. "+" button, tooltip "Add files, connectors, and more". Menu items in order: "Add files or photos" (shortcut ⌘U), "Take a screenshot", "Add to project", "Skills" (submenu listing installed skills), "Add connector" (submenu: "Browse connectors", "Add custom connector"), "Add plugins", "Research" (toggle), "Web search" (toggle, on by default), "Memory" (toggle, on by default).
2. Mode toggle "Chat | Cowork" (segmented, Chat selected by default).
3. Right side: the model button "Sonnet 5 Medium" opens the model picker: Fable 5.1, Opus 5, Sonnet 5, Haiku 4.5, a separate "Effort" row (Low, Medium, High) and "More models". The label shows model name then effort.
4. "Dictate" (microphone) and "Voice input" (waveform) buttons.

Behaviour: Enter sends, Shift+Enter inserts a newline, "/" inside the input opens the skills picker (the placeholder changes to "Type / for skills" while the Skills panel is open, captured 480). Attachments appear as chips above the bottom row.

Cowork mode replaces the placeholder with a task description field and adds a "Project or Manual" source selector and an "Active tasks" list under the composer.

## 3. Conversation view

- Header: the title as a button (click to rename inline), a "More options" button (menu mirrors the sidebar row menu plus Share), and on the right "Share" and a sheet toggle for Files or Artifacts created in the chat.
- Messages: user turns right-aligned in a tinted bubble; assistant turns left-aligned as plain prose without a bubble. Tool activity renders as a collapsible step disclosure in the assistant turn ("Created a file, read a file"); expanding it lists each step with an icon and a one-line summary.
- File outputs render as a file card (icon, name, size) with a "Download" action; artifacts render as a card that opens the artifact in the sheet.
- Action row under every assistant turn: Copy, Read aloud, Thumbs up, Thumbs down, Retry (opens a model submenu), and the timestamp on hover.
- Share popover: "Invite by email" field, an access selector defaulting to "Only people invited", the owner row, and "Copy link".
- Files sheet: every file created or uploaded in the conversation, each with Download; Artifacts sheet: the artifact preview with a code or preview toggle.

## 4. Projects

- /cowork/projects: title "Projects", a "Sort by Last updated" control, "New project" button, a grid of project cards (name, description, last updated).
- Project page (captured 477): breadcrumb "Projects / <name>", the title with a pin toggle and "More options" (Rename, Unpin, Delete), the composer, an empty-state line "Claude references the same knowledge every time you talk to it in this project", and a right column with four blocks: "Instructions" (plus opens an editor), "Memory" (badge "Only you"; "Project memory will show here after a few chats"), "Context" (drop zone "Add PDFs, documents, or other text to reference in this project" with an "Add files" button), "Scheduled" ("Set up recurring tasks for this project" with an add button).
- Conversations started in the project appear in the sidebar under the project.

## 5. Artifacts

- /artifacts (captured 483, 487): title "Artifacts", "Search your artifacts" icon, "New artifact" button, tabs All | Yours | Shared with you, a three-column grid of cards (preview image, title, privacy icon, "Edited <date>", a pin on pinned cards, a "More options" button on hover).
- Opening a card navigates to /code/artifact/<id>?org=<org id> (captured 488): a bare page with the artifact title as a dropdown at the top left, the owner avatar, a "Comment on this artifact" button and a "Share, private" button; first visit shows a "Sharing tip" popover ("Artifacts are private by default. You can update sharing permissions from here at any time."). The artifact body renders full-bleed under that bar.

## 6. Scheduled tasks

- /scheduled-task (captured 478, 481, 485): title "Scheduled tasks", subtitle "Run tasks on a schedule or whenever you need them", a search icon, "Sort by Next run", and "New task" whose menu is "Create with Claude" and "Set up manually".
- Empty state: a stopwatch illustration and "No scheduled tasks yet." Below a wavy divider, six templates in two columns, each with an icon, title, one-line description and a schedule line: Daily briefing (Weekdays at 8:00 AM), Inbox triage (Weekdays at 8:00 AM), Meeting prep (Weekdays at 8:00 AM), Weekly review (Every Friday at 4:00 PM), Content ideas (Every Monday at 9:00 AM), Monitor a topic (Every day at 9:00 AM). Hovering a template shows a sample output card (for example "Today's brief", "High priority", "Product review in 45 min").

## 7. Settings modal

Opened from the account menu, from "Customize" in the sidebar, or by a hash deep link (`#settings/<section>`; observed `#settings/customize-skills`, `#settings/customize-connectors`, `#settings/customize-plugins`). It is a centred modal about 990 px wide with a left rail and a content panel; Escape or the "×" closes it and the hash is removed.

Left rail: a search field at the top, then "Settings": General, Account, Privacy, Billing, Usage, Capabilities, Claude Code, Cowork, Claude in Chrome; then "Customize": Skills, Connectors, Plugins. Each item has a line icon. The selected item has a filled pill background.

### 7.1 General

Profile (name, work function, personal preferences text), Instructions (a long text area for standing instructions), Preferences: Appearance (System, Light, Dark), Chat font (Default, System, Dyslexic friendly), Motion (Full, Reduced); Voice: Language, Style, Speed; Notifications: toggles for task completion and scheduled task results.

### 7.2 Account

"Log out of all devices", "Delete account", the organisation id (copyable), Trusted devices list, and an Active sessions table (device, location, last active, a revoke action per row).

### 7.3 Privacy

Links to the privacy policy and data controls, a "Location metadata" toggle, "Help improve Claude" toggle, "Export data" button, "Shared chats" and "Shared artifacts" management links, a feedback link, and "Memory preferences" (what Claude may remember).

### 7.4 Billing and 7.5 Usage

Billing shows the plan, renewal, payment method and invoices. Usage shows horizontal bars for the current session and the weekly allowance per model family, with reset times.

### 7.6 Capabilities

Memory toggles (memory on, generate memory from chat history), "View and manage memory", "Import memory from other AI providers" (opens an import flow: paste or upload, preview, confirm), "Tool access mode" (Ask, Allow, per tool), "Connector search" toggle (lets Claude search the connector directory itself), "Switch models when flagged" toggle, "Code execution and file creation" toggle with a "network egress" domain allowlist editor underneath, and a Skills toggle that enables the skills system.

### 7.7 Claude Code, 7.8 Cowork, 7.9 Claude in Chrome

Claude Code: classify sessions toggle, switch models toggle, code appearance theme picker. Cowork: trusted devices, "Only on your computer" toggle, preferred browser, global instructions. Claude in Chrome: enable toggle and a per-site permissions table.

### 7.10 Customize: Skills (captured 479, 482, 489)

Panel header: title "Skills", a search icon, a "Browse" button (opens the Directory on the Skills tab) and an "Add" split button whose menu is "Upload skill", "Create a skill", "Create with Claude". Body: a three-column table (Skill, Last updated, Author) listing installed skills; on this account import-memory, morning, skill-creator and web-artifacts-builder, all "Anthropic", all dated 9/1/26. Clicking a row opens the skill detail (section 8.2). Skills are installed, never downloaded; the only download in the skill surface is a single unpreviewable bundled file.

### 7.11 Customize: Connectors

Header: title "Connectors", search, "Add" with the menu "Browse connectors" and "Add custom connector". Body: a "Popular" row of first-party connectors as tiles with their brand logos, then a table with tabs All | Connected | Not connected (Name with logo, Type, Status, a Connect or Configure action). "Add custom connector" opens a form: name, remote MCP server URL, optional OAuth client id and secret under an advanced disclosure, an "Add" button, and a trust warning.

### 7.12 Customize: Plugins (captured 480)

Header: title "Plugins", search, "Browse", "Add". Empty state: a stacked-blocks illustration, "Give Claude role-level expertise with plugins", and a "Browse plugins" button. Installed plugins list as rows with a gear that opens per-plugin settings (enabled skills, required connectors with connect state, example prompts).

## 8. Directory (opened by Browse)

A full-height overlay with a left rail of three tabs (Skills, Connectors, Plugins). The founder's decision for our product: the settings panels themselves are the directory, with no intermediate list-then-Browse step and no separate modal; see `scratchpad/design/directory-spec.md` and the settings parity documents. The observations below describe claude.ai only.

### 8.1 Common chrome (captured 424 to 433)

Top: a full-width search field ("Search skills", "Search connectors", "Search plugins"). Under it: source chips on the left (Skills: "Anthropic", "Yours"; Connectors: heading "Anthropic and partners" with a Popular row; Plugins: "Anthropic", "Partners", plus any marketplace the user added) and "Filter by" and "Sort by" dropdowns on the right. Filter by offers Status (Installed, Not installed) for skills, Type (Interactive, Desktop, Web) and Category for connectors, Status and Source for plugins. Sort by offers Most popular, Recently updated, Name A to Z.

Cards: two columns at desktop, one on phones. Each card shows the icon (connectors, plugins) or a leading slash name (skills), the name, the publisher, an install or download count with a small glyph, badges "New" and "Community" or "Verified", a two-line description, and a trailing control: "+" to add, a gear when already installed or connected.

### 8.2 Skill detail (captured 427)

Back arrow, name, publisher, copy-link, an "Install" button (becomes "Uninstall" once installed and the card shows a gear). Left column: the file tree (SKILL.md first, then folders and files). Right column: the selected file rendered, with "Description" and "License" callouts at the top of SKILL.md, a rendered or raw toggle, and copy. Anthropic skills are read-only; the user's own skills can be edited inline and saved.

### 8.3 Connector detail (captured 430 and the founder's captures 73 to 76)

Back arrow; a header row with a 64 px logo tile, the name, a badge (Community, Verified, or first party), a one-line summary, copy-link, and a "Connect" button (becomes "Connected" with a gear that opens scopes and Disconnect). For community servers a notice: community connectors have passed automated checks only, they can read what you send them and may return instructions to the assistant. Then the long description; "Developed by <publisher>" as a link with a trust line; "Tools" with a count badge and chips (a "+N more" expander after the first row); "Categories" with a count badge and chips; a hairline; "Details" with Author (link) and Connector URL (mono, with copy); "More info" with Documentation, Support and Privacy Policy links when known. Logos are the vendor's official mark.

Connect flow: OAuth connectors open the provider's consent page in a popup and return to the detail with Connected; API key connectors show a key form; desktop-only (stdio) connectors show "Available in the desktop app" instead of Connect.

### 8.4 Plugin detail (captured 432, 433)

Back arrow, name, "by <publisher>", a link to the source, description, "Try asking" example prompts as rows, and "Install" (becomes "Installed" with a gear). The "+" next to the plugin filters opens "Add marketplace" with two choices: "Browse Anthropic sources" and "Add from a repository" (a form: repository URL, optional ref, then a preview of the manifest's plugins before confirming).

## 9. Counts observed

Skills directory: 13 entries. Connectors directory: 2,368 entries across ten categories. Plugins directory: 96 entries. Installed on this account: 4 skills, 0 plugins, several connected first-party connectors.

## 10. How this maps to our product

- Shell: our sidebar already carries New, Projects, Artifacts, Scheduled and Customize; the account menu items map to our settings sections. Our Code toggle maps to the CLI and desktop surfaces rather than a separate web product.
- Composer: our plus menu must carry files, screenshot, add to project, skills, add connector (browse and custom), plugins, research, web search and memory toggles in that order; the model button label is model then effort.
- Settings modal: same rail order. The Customize section is where the directory lives; per the founder, each Customize panel is the directory (search, chips, filters, installed section, catalog grid, inline detail with Back), with install semantics for skills and connect semantics for connectors.
- Connector detail anatomy and logo policy: shipped brand marks for known vendors, the registry or developer-site icon through our proxy for community entries, a monogram fallback, never a hotlink to another product's CDN.
- Not observed and therefore not specified: the Design surface, the Code surface, the incognito chat entry, the Cowork task detail, the Billing invoice list and the Usage bars' exact copy.
