# Claude Desktop Extended Settings & Customization

**Image set covered**:

- `/reference/claude-desktop-captures-2026-05-13/extended/` (020 files: 024-043)
- `/reference/ui-capture-runs/20260513-185809-agent-platform-reference/screenshots/claude-desktop/` (018 files: 200-218)

**Total images read**: 38 PNG files

---

## Mislabel report

None found. All filenames accurately describe their content.

---

## Per-competitor pattern inventory

### Claude Desktop

#### 1. APP SHELL

- Main sidebar (collapsed/expanded toggle via hamburger icon at top-left)
- Left sidebar sections: Chat, Projects, Artifacts, Customize, Recents, Desktop app (General, Extensions, Developer)
- Profile/user avatar in sidebar footer with popover menu (Settings, Language, Get help, View all plans, Gift Claude, Learn more, Log out)
- Search bar at top of sidebar
- Icon-based top navigation (chat, composer, code tabs visible in header)

#### 3. EMPTY STATE

- Hero text: "Good evening, Siddhartha Nagula" (time-aware greeting)
- Centered text "How can I help you today?" in text input field
- Below composer: 5 quick-action pills: Code, Write, Learn, Life stuff, From Gmail (each with icon + label)
- Model display: "Opus 4.7 Adaptive" with dropdown indicator and microphone icon (voice)

#### 4. COMPOSER

- Large text input area with placeholder "How can I help you today?"
- Left of input: "+" icon (attachment menu)
- Center-right: Model picker showing "Opus 4.7" with "Adaptive" badge and dropdown
- Right: Microphone icon for voice input
- Below composer: Horizontal pill bar with quick-action shortcuts (Code, Write, Learn, Life stuff, From Gmail)
- Slash command support (/ prefix triggers command palette)

#### 8. CONNECTORS / TOOLS / SKILLS

- **Connectors sidebar section** in Customize view:
  - Directory/gallery grid showing 10+ connectors: Slack, Box, Espyre, Atlassian Pivot, Microsoft 365, Deconsum, Google Calendar, Gmail, etc.
  - Status badges: "Connect", "Install" states
  - Per-connector actions: "Install", "Connect", "Always allow", "Deny"
  - Search bar at top of connector gallery
  - Context menu for additional options
  - Connectors require OAuth grant flows (shown in settings detail view)
  - Global permission toggles: "Always allow" / "Needs approval" / "Blocked" / "Custom" options

- **Skills sidebar section** in Customize view:
  - Categorized grid: Legal, Slack by Salesforce, Common room, Brand voice, Apollo, Product management, Productivity, Enterprise search, Sales, Finance, Data, Marketing, Design, Engineering, Operations, Customer support
  - Each skill has title, metadata (topic tags), usage count ("5 LLM"), last updated date
  - Per-skill detail view shows:
    - Brief description
    - "Your Task" prompt (user-customizable instructions for the skill)
    - "How much to follow..." guidance (AI patterns, tone, emphasis etc.)
    - Modes selector
    - Inline edit capability (pencil icon → "Edit" button)
  - Slash command invocation: `/skill-name` in composer
  - Skills appear in menu (215 image shows skill in dropdown when typing "/" in composer)

#### 9. SETTINGS

- **Left-nav structure** (11 main sections visible):
  - General
  - Account
  - Privacy
  - Billing
  - Usage
  - Capabilities
  - Connectors
  - Claude Code (sub-section)
  - Cowork (sub-section)
  - Claude in Chrome (Beta label)
  - Desktop app (submenu: General, Extensions, Developer)

- **General section**:
  - Profile subsection: Avatar, Full name, "What should Claude call you?", "What best describes your work?", Instructions for Claude (custom system prompt)
  - Preferences subsection: Appearance toggles (light/dark), Chat font (dropdown), Chat font selector

- **Account section**:
  - Log out of all devices button
  - Delete account button (requires canceling Claude Max subscription first)
  - Organization ID display with copy button

- **Active sessions table**:
  - Columns: Device, Location, Created, Updated
  - Example devices: Chrome (Mac OS X), Claude (iOS), Claude Desktop
  - Current session marked with blue "Current" badge
  - Three-dot menu per session (context actions)

- **Privacy section**:
  - "Anthropic believes in transparent data practices" message with Privacy Center + Privacy Policy links
  - Two subsections: "How we protect your data" + "How we use your data"
  - Preferences toggles:
    - Location metadata (with Learn more link)
    - Help improve Claude (with Learn more link)
  - Your data section:
    - Export data button
    - Shared chats (Manage button)
    - Memory preferences (Manage button with external link icon)

- **Billing section**:
  - Plan display: "Max plan" with "$20k more usage than Pro" badge
  - CTA: "Adjust plan" button
  - Payment method: "Link by Stripe" with "Update" button
  - Debit credit: $0.38 display
  - Invoices table: Columns: Date, Due, Total, Status, Actions (View links)
  - Invoices sorted by date (May 2026 → Feb 2026 visible)

- **Usage section**:
  - Plan limits header: "Max (20x)"
  - Current session subsection: "Starts when a message is sent", progress bar, "0% used"
  - Weekly limits subsection: "Learn more about usage limits" link, "All models" progress bar (25% used, Resets Wed 8:00 PM), "Sonnet only" (0% used), "Claude Design" (7% used)
  - Last updated timestamp at bottom

- **Capabilities section**:
  - Memory subsection:
    - "Search and reference chats" toggle (on)
    - "Generate memory from chat history" toggle (on)
    - "View and manage memory" expandable link (clock icon)
    - "Import memory from other AI providers" button (Start import)
  - General subsection:
    - "Tool access mode" toggle
    - "Connector discovery" toggle (off)
  - Visuals subsection: (title visible, content cut)

- **Connectors section**:
  - Message: "Connectors have moved to Customize. Head there to browse, connect, and manage them."
  - (Navigation redirects to Customize view)

- **Claude Code section**:
  - "Gift a week of Claude Code" promo card with cute pixel robot image
  - Guest pass link
  - Code appearance subsection: Font selector (Anthropic Mono), Light/Dark theme preview (syntax highlighting visible)

- **Cowork section**:
  - "Dispatch Beta" toggle (on)
  - "Gift a week of Claude Cowork" promo card with illustration
  - Supported apps: Excel, PowerPoint, Chrome, Claude Code (with icons)
  - Guest pass link with "Copy link" button
  - Global Instructions section with "Edit" button

- **Claude in Chrome (Beta)** section:
  - Extension icon
  - "Site permissions" subsection: "Default for all sites" (Allow extension button), "Choose whether Claude in Chrome works on all sites by default"
  - Info: "Claude in Chrome works everywhere except sites you block below"
  - Blocked sites subsection: "Claude in Chrome cannot be used on these sites", Domain input field, "+ Add websites" button
  - Status: "No sites added yet"

- **Desktop app → Extensions section**:
  - Description: "Allow Claude to directly interact with apps, data, and tools on your computer."
  - Installed extensions list: Filesystem, Excel (by Anthropic), Read and Write Apple Notes, Appy, Control your Mac, Tableau MCP Server, Desktop Commander, Context7
  - Per-extension: Configure button, More menu (...)
  - "Browse extensions" link at top-right
  - Advanced settings section: "Drag, MCP file, or DART files here to install"

- **Desktop app → Developer section**:
  - Local MCP servers subsection: "Add local managed MCP servers that you're working on."
  - Edit Config button
  - Filesystem server (Managed - blue badge)
  - Command display: `/User/siddhartha/lib/application-support/ClaudeDesktop/claude_desktop_config.json`
  - Per-server: Arguments expandable list, View Logs button
  - Logs shown inline with start timestamp, arguments, and environment details

#### 10. PROFILE / USER POPOVER

- Popover accessed via sidebar footer avatar/name
- Menu items:
  - Settings (with shortcut "S")
  - Language (with submenu indicator)
  - Get help (with submenu indicator)
  - View all plans
  - Gift Claude
  - Learn more (with submenu indicator)
  - Log out (with submenu indicator, red text?)

#### 12. PRICING / UPGRADE

- Billing section in Settings shows current plan (Max $20k+ usage)
- Inline upgrade path: "Adjust plan" CTA in billing view
- Paywall pattern: Plan display with CTA to upgrade shown in settings
- Invoice history: table with date, due date, total, status (Paid), View action links

#### 15. AGENTIC / COMPUTER USE

- **Filesystem extension** shown in Desktop app > Extensions
- **Tool permissions model**:
  - Extension can be toggled Enabled/Disabled with Uninstall button
  - Allowed Directories (Required) section: filesystem path input + "Add directory" button
  - Tool permissions subsection: per-tool granular controls
    - Read-only tools section (9 tools listed):
      - Read File (Deprecated) — status icons: info, eye-slash, circle-x (for deny/block)
      - Read Multiple Files — status icons
      - List Directory — status icons
      - List Directory with Sizes — status icons
    - Per-tool permission states: checkmark (allow), eye-slash (deny), circle-x (block), ...
  - "Needs approval" dropdown with states: Always allow, Needs approval, Blocked, Custom

- **Permission prompt UX** (213 image):
  - "Thinking about listing and interpreting UI state filenames from a screenshot directory"
  - "List Directory" permission request with "Always allow" / "Deny" button pair
  - CTA: "Claude wants to use List Directory from Filesystem"

- **Tool result rendering** (214 image):
  - Filesystem results shown as table: Filename, Implied UI state columns
  - Inline in message (not separate artifact pane)
  - Context-aware summary: "How can it list and what could UI state suggest?" header

- **Skill invocation with tool results** (215-218 images):
  - Slash menu shows skill (UI screenshot filenames analysis)
  - Skill selected in composer shows skill name chip: `skill-create`
  - Composer allows additional prompt text alongside skill
  - Tool results from skill execution shown inline with table format
  - Follow-up context and key takeaways rendered as formatted text block

#### 11. MODEL / MODE FEATURES

- Model selector in composer showing "Opus 4.7 Adaptive" with dropdown
- "Adaptive" badge indicates reasoning/mode selection
- Model is changeable per-message via dropdown
- Display in empty state prominently shows model name + capability badge

---

## Standout patterns worth copying

1. **Connectors moved to Customize nav** — Settings > Connectors section redirects user to Customize view for managing connectors/skills; keeps settings focused on account/billing/privacy/capabilities. AGI Workforce should consider same pattern if Skills/Connectors belong in a hub, not settings.

2. **Per-tool granular permission UI** — Extension detail view shows checklist of all tools with Allow/Deny/Block/Custom toggles per tool, not just a binary toggle. Tool + permission icon set (checkmark, eye-slash, circle-x) makes state explicit at a glance. Our desktop extensions need similar UX when wiring FilesystemExt/ControlYourMac.

3. **Active sessions table in Account section** — Shows all signed-in devices with Device type, Location, Created/Updated timestamps, current session badge. Useful for security + logout-from-elsewhere UX. Mobile/web/desktop multi-session visibility here is valuable.

4. **Customizable Instructions for Claude (system prompt)** — Profile section has text field for user-defined system instructions that apply globally (or per-project). Easier UX than project-level prompts for setting tone/style.

5. **Memory management in Privacy settings** — "View and manage memory" expandable link + "Import memory from other AI providers" button. Memory is privacy-critical so belongs in Privacy section, not Capabilities. Good IA precedent.

6. **Skill detail shows "Your Task" + "How much to follow..." guidance** — Skills in Customize view show custom-writable instructions + AI tone guidance ("Identify AI patterns", "Briefly problematic sections", "Preserve meaning"). Skill design template with these sections is novel.

7. **Inline tool permission prompts with verb phrasing** — "Claude wants to use [Tool name] from [Extension]" + "Always allow" / "Deny" buttons. Clear, specific language vs generic "Allow access" pattern. Our desktop + mobile should adopt this.

8. **Cowork global instructions + app badges** — Cowork settings show which apps support it (Excel, PowerPoint, Chrome, Claude Code) with icons + toggle + editable global instructions. Clear capability ceiling + visibility.

9. **Extensions directory with search + Browse button** — Settings > Extensions shows installed list + "Browse extensions" link opens directory overlay. Separation of installed vs discoverable keeps settings cleaner.

10. **Billing invoice table with View actions** — Invoices shown inline as sortable table (Date/Due/Total/Status/Actions) with individual View links. No separate invoice detail page needed; state is transparent at a glance.

---

## Anti-patterns or design choices to avoid

1. **Promo cards in Settings (Claude Code, Cowork gift passes)** — Gifts/upsells in settings feel like dark pattern. Users are in settings to configure, not be marketed to. If gifts are part of product, put in onboarding/home or separate Gifts section, not settings mix.

2. **"Connectors moved to Customize" message instead of navigation** — Instead of inline link, Claude shows static text "Connectors have moved to Customize." Better UX: auto-navigate or show a clickable card. Text-only migration message is confusing.

3. **Debit credit display without context ($0.38)** — Shows debit balance but no explanation of what it is or when it resets. Users unfamiliar with "debit credit" model won't understand. Add one-line helper text.

4. **Tool permissions: icon-only without hover text** — Eye-slash / circle-x / checkmark icons for Allow/Deny/Block are compact but require learning. Add tooltip or legend clarifying each icon state.

5. **"Needs approval" dropdown buried in extension detail** — Three-state permission choice (Always allow / Needs approval / Blocked / Custom) is important but shown as dropdown in small text. Should be radio button group or more prominent UI to avoid accidental state change.
