# ChatGPT & Codex Desktop Reference Analysis

**Image set covered**:

- `/Users/siddhartha/Desktop/reference/ui/chatgpt-desktop/` — 18 files
- `/Users/siddhartha/Desktop/reference/ui/codex-desktop/` — 21 files
- **Total images read**: 39

---

## Mislabel report

None found. Filenames accurately describe content across both sets.

---

## Per-competitor pattern inventory

### ChatGPT Desktop

#### 1. APP SHELL

- Top bar with native macOS chrome (traffic lights, menu: File, Edit, View, Chats, Window, Help)
- Toolbar area shows "ChatGPT 5.4 Thinking >" with model badge
- Right-side toolbar icons: share, branch (two-window icon)
- No visible sidebar at full window (but sidebar expandable — seen in 05_sidebar-expanded)
- Sidebar when expanded: ChatGPT (profile icon), GPTs (chevron), New project, claude prompt, Coding, ABI Automation LLC, codex sections
- Left sidebar lists numbered projects (Amazon assessment, Hackathon, Roadmap, etc.) and saved threads
- Profile popover (bottom-left) shows email, Upgrade CTA, Settings, Log out

#### 3. EMPTY STATE

- Hero: centered "Let's build [project-name]" with Codex-style icon (circular burst outline)
- 3 action cards: "Build a classic Snake game", "Create a one-page $pdf", "Create a plan to..."
- "Explore more" link upper-right
- Empty state background: dark gradient

#### 4. COMPOSER

- Bottom fixed-position text input: "Ask anything"
- Left action bar (4 icons): + (attach), globe (web search), agent icon, text-formatting A
- Model badge "5.4 Thinking" always visible in composer area (right-aligned or left-aligned)
- Attachment menu (file icon): Upload file, Upload photo, Take screenshot (+ submenu for Built-in Retina Display / Popout), Take photo
- Model selector dropdown: Auto (decides thinking duration), Instant (answers right away), Thinking (checked/current, "Thinks longer for better answers"), Legacy models (submenu arrow), Temporary Chat toggle
- Voice recording: push-to-talk → floating card (upper-right) shows timer (0:02), "Stop" button (red square), "Ask before recording others" helper text
- Voice pause/resume: card shows Resume button (radio) + Send button (blue), timer continues (0:05)
- Voice upload prompt (modal): "Upload this recording?" with Upload (blue), Delete (red), Cancel buttons
- Search mode: "Search the web" composer, trending queries listed (no kings protest march 28, David Muir, Illinois basketball, Danica Patrick)
- Web search badges at bottom: "Search" tab (blue, clickable) + "Agent" pill

#### 5. CHAT / MESSAGES

- Thinking blocks: "Thought for 2fs" header, expandable content showing multi-line reasoning with code blocks
- Tool-use inline: PreToolHook reasoning chain, collapsible, shows "Thought for fig 3"
- Web search results with inline favicons and source links
- Message actions visible (copy, rate, regenerate implied)

#### 7. PROJECTS / SPACES

- Create modal: header "Projects give ChatGPT shared context across chats and files, all in one place"
- Text input: "Project Name" with placeholder icon
- Preset badges: Investing (green dollar icon), Homework (blue mortarboard), Writing (purple pen)
- CTA: blue "Create project" button, blue "More options" link
- Project detail view (Amazon assessment): Chats tab + Sources tab showing curated content + list of sources (Max Array Correlation, Mock Interview Prompt API, Python DSA Roadmap, Amazon Interview Prep)

#### 9. SETTINGS

- Left-nav tabs implied (not fully visible in captures): General, Account, Appearance, Privacy, Billing, Usage, Capabilities, Shortcuts, Notifications, MCP-Servers, Developer, Extensions, Archived, Worktrees, Environments, Git

#### 10. PROFILE / USER POPOVER

- Card format: email address (siddharthanagula3@gmail.com)
- Button rows: "Upgrade your plan" (CTA), "Settings" (with icon), "Log out"
- Display name row: initials avatar (SN) + full name (Siddhartha Nagula)

---

### Codex Desktop

#### 1. APP SHELL

- Top bar: native macOS chrome (traffic lights, file menu indicators)
- Left sidebar (fixed width, teal/slate background): "New thread" (icon + label), "Plugins" (icon + label), "Automations" (icon + label)
- Threads section below with sort/view toggles: "agiworkforce" thread listed with 3-dot menu + pin icon
- "Settings" link at bottom-left
- Center breadcrumb: "New thread" (title area)
- Right toolbar: dropdowns (branching icon), "Commit" button (dropdown), copy button, full-screen/popout icons, +416 -132 (git stats), settings icon

#### 2. ONBOARDING / AUTH

- Not visible in captures (assumed handled separately)

#### 3. EMPTY STATE

- Same as ChatGPT: "Let's build agiworkforce" hero with circular icon
- 3 action cards: "Build a classic Snake game in this repo", "Create a one-page $pdf that summarizes this app", "Create a plan to..."
- "Explore more" link with close (X)

#### 4. COMPOSER

- Bottom input: "Ask Codex anything, @ to add files, / for commands, $ for skills"
- Left action bar: + (custom icon), Custom (model dropdown), Medium (reasoning dropdown)
- Attachment menu row: "Add photos & files" option
- Mode toggles: "Plan mode" (switch icon, blue toggle ON), "Speed" (dropdown with arrow)
- Status indicators (bottom-left): "Local 6%" (local mode indicator), "Full access" (orange toggle ON, dropdown)
- Branch indicator (bottom-right): "$ main" (current branch dropdown)
- Permissions dropdown: "Default permissions" selected, "Full access" checked/alternative option
- Local status dropdown: "Local project" (checkmark selected), "New worktree" (checkbox + chevron), "Connect Codex web" (external link icon), "Send to cloud" (cloud icon), "Rate limits remaining 63%" (info + chevron)
- Model selector: "Custom" dropdown showing GPT-5.4, GPT-5.4-Mini, GPT-5.3-Codex, GPT-5.2-Codex, GPT-5.2, GPT-5.1-Codex-Max, GPT-5.1-Codex-Midi (17 options visible, scrollable list)

#### 6. CHAT / MESSAGES

- Thread history visible in left sidebar with line numbers and abbreviated thread titles

#### 7. PROJECTS / SPACES

- Not fully visible in captures

#### 9. SETTINGS

- Left-nav structure: "Back to app", General (icon + label), Appearance, Configuration, Personalization, Usage, MCP servers, Git, Environments, Worktrees, Archived threads
- General tab contents: Default open destination (Cursor dropdown), Language (Auto Detect), Thread detail (Steps with code commands), Prevent stale while running toggle, Request AI-gen to send long prompts toggle, Speed dropdown (Standard), Follow-up behavior (Quirks/Saner)
- Notifications subsection: Turn completion notifications, Enable permission notifications, Enable question notifications
- Appearance tab: dark theme toggle (ON), accent color picker, font size control, contrast adjustments
- Configuration tab: Custom config (Edit instructions), Approval policy (On request dropdown), Sandbox settings (Read-only), Import external agent config (link + copy instructions), Skills (checkboxes + "Apply selected" button)
- Personalization tab: Personality selector, Custom instructions textarea
- Usage tab: 5 hour usage limit (89% left), Weekly usage limit (6% left), Credit section (0 credit remaining, Purchase button), Auto-reload credit toggle
- MCP servers tab: List of servers with toggle controls (playwright, context7, memory, openalDeveloperDocs, sequential-thinking, github, vercel, figma, supabase — all enabled)
- Git tab: Branch prefix input (codex/), Pull request merge method dropdown (Merge/Squash), Show PR icons toggle, Always force push toggle, Commit instructions textarea, Pull request instructions textarea
- Environments tab: Project selector dropdown (not fully captured)
- Worktrees tab: Auto-delete toggle (ON), Auto-delete limit slider (15), "No worktrees yet" empty state message
- Archived threads: Empty state view

#### 10. PROFILE / USER POPOVER

- Email row: siddharthathanagula@gmail.com
- Account info: "Personal account"
- Settings link, Language selector, Rate limits remaining (0%), Log out

#### 11. MODEL / MODE FEATURES

- Plan mode: toggle in composer area (switch control), enabled in full-access state
- Speed mode: "Speed" dropdown menu item in composer, callable from plan-mode menu
- Permissions: "Default permissions" vs "Full access" selector in composer area
- Local status dropdown: branching logic (Local project / New worktree / Connect Codex web / Send to cloud)
- Model selector: rich dropdown with 17+ GPT models available
- Worktree management: "New worktree" option in local-status dropdown

#### 15. AGENTIC / COMPUTER USE

- Approval policy setting: "On request" (user approves before action) vs implied "Act" mode
- Sandbox settings: "Read-only" vs implied full-access toggle

#### 18. CLI / TUI UX

- Terminal panel docked at bottom: "Terminal zsh" label, command prompt "siddharthaMac agiworkforce % |"
- Terminal close button (X) right-aligned
- Status bar at very bottom shows git branch and model info

---

## Standout patterns worth copying

1. **Model selector in composer** (ChatGPT + Codex) — shows model name with explanatory subtitles (Auto, Instant, Thinking, Legacy) grouped by category; enables instant mode-switching without leaving chat. Copy pattern for 10+ provider list.

2. **Voice recording lifecycle** (ChatGPT) — push-to-talk → active recording card (timer + Stop) → pause card (Resume + Send buttons) → upload confirmation modal. Matches Wispr-Flow spec; robust UX.

3. **Local status dropdown** (Codex) — single entry point for mode switching (Local project / New worktree / Connect Codex web / Send to cloud / Rate limits). Consolidates multi-step workflows. Port to AGI Workforce for local↔cloud migration.

4. **Attachment menu with context submenus** (ChatGPT) — "Take screenshot" expands to show display options (Built-in Retina Display, Popout). Reduces visual clutter vs flat menu.

5. **Permissions dropdown in composer** (Codex) — granular control (Default permissions / Full access) without modal. Inline toggle for user comfort.

6. **Settings left-nav with icons** (Codex) — 12+ sections (General, Appearance, Configuration, Personalization, Usage, MCP servers, Git, Environments, Worktrees, Archived threads). Visual clarity via icon + label. Scale to all 6 AGI surfaces.

7. **Thinking/reasoning block expansion** (ChatGPT) — collapsible "Thought for 2fs" shows internal reasoning chain inline in message. Users understand model's thought process without leaving chat.

8. **Project card templates** (ChatGPT) — "Create project" modal offers preset badge categories (Investing, Homework, Writing). Reduces blank-slate friction.

9. **Bottom-right git status badge** (Codex) — "+416 -132" change count in top-right corner. Persistent reminder of uncommitted work without modal.

10. **Settings sections with subsection headers** (Codex Configuration) — "Custom config (Edit instructions)" + "Approval policy" + "Sandbox settings" grouped under Configuration. Clear IA for power-user workflows.

---

## Anti-patterns or design choices to avoid

1. **Sidebar auto-hide/collapse** (ChatGPT) — sidebar is hidden by default in full-window view; users must click to expand. Creates cognitive overhead. AGI Workforce should default to persistent left sidebar (option to collapse via button).

2. **Model mode badge in top bar** (ChatGPT "ChatGPT 5.4 Thinking >") — dual location (top bar + composer area) creates redundancy and splits attention. Single source of truth in composer is cleaner (Codex pattern).

3. **Legacy models in dropdown** (ChatGPT model selector) — "Legacy models (submenu arrow)" suggests deprecated state but is still callable. Either deprecate fully or remove visual demotion; mixed signal confuses users.

4. **Temporary Chat toggle in model selector** (ChatGPT) — mixing chat-mode controls (temporary session) with model selection in same popover is conflating concerns. Should be separate toggle/setting.

5. **Rate limits as info text only** (Codex "Rate limits remaining 63%") — shown in dropdown only, not on main UI. Users miss quota warnings until buried in settings. Should surface in status bar or banner if &lt;20% remaining.
