# Claude Desktop Reference Analysis

**Image set covered**: `/Users/siddhartha/Desktop/reference/ui/claude/claude-desktop/` (39 files) + `/Users/siddhartha/Desktop/reference/claude-desktop-captures-2026-05-13/` (23 files)
**Total images read**: 62

## Mislabel report

None found. Filenames accurately describe content.

## Per-competitor pattern inventory

### Claude Desktop

#### 1. APP SHELL

- Left sidebar (collapsed/expanded toggle via hamburger). Sections: New Chat, Search, Customize, Chats, Projects, Artifacts, Code.
- Sidebar footer: user profile avatar with account name.
- Top bar: back/forward navigation, window controls (minimize/fullscreen), settings icon top-right.
- Tab bar: Chat / Cowork / Code (three primary modes).
- Three-pane layout option: sidebar + chat + right panel (project/artifact detail).
- Sidebar recents list with timestamps; chat search field in sidebar.

#### 2. ONBOARDING / AUTH

- Post-auth, no splash shown in desktop captures. Mode selection appears in initial setup (not shown in reference set, but mentioned in codebase).
- Profile popover (avatar → Settings, Language, Get help, Upgrade plan, Get apps and extensions, Gift Claude, Learn more, Log out).

#### 3. EMPTY STATE

- Hero framing: "Good evening, [name]" / "Let's knock something off your list" (productivity-first, not coding-first).
- Suggested quick-action chips: Code, Write, Learn, Lift stuff, From Drive, From Gmail.
- Model badge: Sonnet 4.6 Extended (top right of composer).
- Golden hour thinking illustration + burst icon in header.

#### 4. COMPOSER

- Text input with placeholder "How can I help you today?"
- Model picker: dropdown right-aligned showing "Sonnet 4.6 Extended" with reasoning effort toggle ("Extended").
- Voice button: microphone icon right side. Microphone settings menu with device/codec selection (appears as terminal-like interface in one capture).
- Attachment menu: + icon opens submenu (Files / Add file or photos / Skills / Connectors / Plugins).
- Mode selector (three top buttons: Chat, Cowork, Code).
- Add icon for inline attachments (files, screenshots).
- Reasoning effort: "Extended" mode toggle visible top-right of composer area.

#### 5. CHAT / MESSAGES

- User messages: left-aligned, dark background, plain text.
- Assistant messages: right-aligned, light text on dark bg, inline markdown rendering.
- Thinking blocks: not prominently shown in captures (likely collapsed by default per SCHEMA note).
- Inline tool use: status chips, expandable request/response JSON (inferred from architecture).
- Copy/regenerate/rate buttons below messages (visible as action row).
- Scroll-to-bottom FAB implied (scroll affordance visible).

#### 6. ARTIFACTS / SIDEBAR

- Right sidebar panel: shows artifact preview, metadata, and inline rendering.
- Artifact types shown: code snippets, text, projects (inferred).
- Sidebar tabs: (structure inferred, not fully visible in captures).
- Multi-artifact cards possible (not shown in set).

#### 7. PROJECTS / SPACES

- Projects gallery: grid of project cards (research, claude Prompt, How to use Claude).
- Project detail: left sidebar shows project name, right sidebar shows Memory/Instructions/Files sections.
- Project-level system prompt: editable field in Instructions panel.
- Chat history within project: visible in left sidebar nested under project.
- Create new project button top-right.

#### 8. CONNECTORS / TOOLS / SKILLS

- Connectors directory: grid layout with alphabetical list (Google Drive, GitHub, Gmail, Airtable, Vercel, Google Calendar, etc.).
- Connector detail: icon, name, description, enabled toggle, tool permissions table.
- Permission toggles per tool: read-only vs interactive (e.g., Gmail: read, list, create drafts; Vercel: read, deploy).
- Permission states: "Always allow", "Always block", "Ask".
- OAuth modal for Slack: "Grant access to Slack" with browser redirect instruction.
- Skills installed in sidebar (submenu). Skill detail view shows description, usage instructions, categorized tools.
- Plugin categories: Legal, Slack by salesforce, Common room, Brand voice, Apollo, Product management, Productivity, Enterprise search, Sales, Finance, Data, Marketing, Design, Engineering, Operations, Customer support.
- Plugin selection: clicking plugin shows inline instruction card with slash-command syntax.
- Add custom connector option at bottom.

#### 9. SETTINGS

- Left nav sections: General, Account, Privacy, Billing, Capabilities, Connectors, Claude Code, Desktop app, General (subsection), Extensions, Developer.
- General tab: Profile (full name, bio), Notifications (toggle), Appearance (color mode, background animation, chat font).
- Account tab: Log out all devices, Delete account, Organization ID, Active sessions table (device, location, created, updated, actions).
- Privacy tab: Data protection practices, Export data, Shared chats, Memory preferences, Location metadata toggle, Help improve Claude toggle.
- Billing tab: Free plan badge + Upgrade CTA, Invoices table (date, due, total, status, actions).
- Capabilities tab: Memory (generate memory toggle, import from AI providers), Tool access (load when needed vs always loaded), Visuals (artifacts toggle, AI-powered artifacts toggle, inline visualizations, code execution), Skills (moved to Customize).
- Connectors: moved to Customize page (banner says "Connectors have moved to Customize").
- Claude Code: auth tokens list with deletion affordance.
- Desktop app: Run on startup, Quick access shortcut, Voice shortcut, Menu bar toggle, Keep computer awake toggle.
- Extensions: list of installed extensions with Configure buttons, Browse extensions link.
- Developer: MCP Servers config, server details panel.

#### 10. PROFILE / USER POPOVER

- Account email at top.
- Settings (gear icon) / Language (globe) / Get help / Upgrade plan / Get apps and extensions / Gift Claude / Learn more / Log out.
- Keyboard shortcut indicator (⌘,) for Settings.

#### 11. MODEL / MODE FEATURES

- Reasoning effort selector: "Extended" (shown as dropdown or toggle).
- Mode toggle: Chat / Cowork / Code top-level tabs (not traditional "Quick mode" modal).
- Model auto-selection inferred but not prominent in captures.
- Cowork mode shows active task list, scheduled tasks, live artifacts, dispatch tab.

#### 12. PRICING / UPGRADE

- Plans page: Individual / Team and Enterprise tabs.
- Individual plans: Free ($0) / Pro ($17/mo) / Max ($100+/mo). Feature matrix below each tier.
- Yearly discount shown: "Yearly Save 17%".
- Free plan features: Chat on web/mobile/desktop, generate code, visualize data, Slack+Google Workspace, built-in web search.
- Pro features: Up to 20x more computations, Claude Code in IDE, power through tasks with Cowork, higher usage limits, deep research, memory across conversations.
- Max features: Everything in Pro, plus higher output limits, priority access, Claude in PowerPoint.
- Team/Enterprise plans: Standard seat $20/mo, Premium seat $100/mo, contact for Enterprise.
- Usage limits visible: "[Free plan] Only on Claude" CTA.

#### 13. ADMIN / ENTERPRISE

- Organization ID visible in Account settings.
- Active sessions management (log out device, device location/created/updated timestamps).
- Team/Enterprise pricing modal with seat management and compliance options.

#### 14. MOBILE / COMPACT MODE

- Not explicitly shown in desktop captures (mobile would be separate surface).

#### 15. AGENTIC / COMPUTER USE

- Cowork mode: task list panel showing active tasks, scheduled tasks, live artifacts.
- Task display: title + metadata (in progress indicator visible).
- Artifacts panel: shows generated code/content inline within Cowork.
- Dispatch tab placeholder (beta noop state observed in one capture).

#### 16. BROWSER EXTENSION UX

- Not in scope for desktop captures.

#### 17. VSCODE EXTENSION UX

- Not in scope for desktop captures.

#### 18. CLI / TUI UX

- Not in scope for desktop captures (CLI is separate surface).

## Standout patterns worth copying

1. **Three-mode app shell (Chat/Cowork/Code)** — observed in 001, 010-023. Tabs at top level allow instant mode switching without nav hierarchy; users stay in same project/context across modes.
2. **Composer attachment menu via + icon with categorized submenus** — observed in 002, 004-006. Separates Files/Photos/Skills/Connectors/Plugins into clear sections; reduces cognitive load vs flat list.
3. **Cowork sidebar + live artifact preview + task list** — observed in 001, 014, 018. Shows active work state in one glance; eliminates click-to-expand for ongoing tasks.
4. **Project detail three-pane (sidebar chat + main compose + right panel for Memory/Instructions/Files)** — observed in 05. Dense but powerful for knowledge workers; reduces window switching.
5. **Connector permission matrix with per-tool toggles (read/list/create/delete)** — observed in 24-32. Granular UX beats binary OAuth; builds trust for privacy-conscious users.
6. **Skill/Plugin inline instruction card with slash-command syntax** — observed in 008. Discoverable without leaving chat; same-affordance onboarding as tool use.
7. **Settings left-nav with subsections (General > Profile, Notifications, Appearance)** — observed in 07-19. Scales to 12+ sections without overwhelming; search not needed for quick discovery.
8. **Microphone settings modal with device/codec dropdowns** — observed in 009. One-click access to audio config; radio button states (e.g., "Enabled") reinforce current selection.
9. **Pricing individual vs team tabs with feature matrix per tier** — observed in 35-36. Side-by-side comparison beats sequential pages; yearly discount callout ("Save 17%") increases conversion.
10. **Customize/Connectors landing with Browse button** — observed in 14. Delegates catalog browse to dedicated view, reducing clutter in settings.

## Anti-patterns or design choices to avoid

1. **Deep nesting of mode settings (e.g., Cowork sub-tabs for Tasks/Artifacts/Dispatch)** — observed in 017-020. Favors discoverability over simplicity; risk of hidden state. Prefer flat tabs or clear section dividers within one panel.
2. **Connector permission granularity without pre-sets (e.g., allow admin to auto-grant read-only)** — observed in 24-32. Each permission toggle is a choice; no "recommended" baseline. Increases setup friction for team admins.
3. **Plan comparison with separate Individual/Team tab toggle** — observed in 35-36. Requires user to flip context; consider horizontal layout or stacked cards on one view for mobile compat.
4. **Desktop-only Cowork Dispatch (tab present but noop)** — observed in 019. Adds UI debt if feature is gated. Better: omit until shipping, or hide behind feature flag with clear "coming soon" messaging.
5. **Microphone settings as separate modal rather than inline settings panel** — observed in 009. Context-switch friction. Prefer inline controls in Composer, with "more options" link for advanced (device/codec).
