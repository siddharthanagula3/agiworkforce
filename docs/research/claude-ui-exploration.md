# Claude.ai Comprehensive UI Exploration

**Date**: 2026-03-19
**Plan**: Max plan (logged in as Siddhartha Nagula)
**URL**: https://claude.ai

---

## 1. Home / New Chat Page

**URL**: `https://claude.ai/new`
**Layout**: Full-viewport dark background with centered content. Sidebar (collapsed=icon-only 48px, expanded=~280px) on left. Main area displays greeting + input box + quick action pills.

### Key Elements

- **Greeting**: Dynamic time-of-day text (e.g., "Golden hour thinking") with an orange/coral starburst icon to the left. Large serif font, centered.
- **Input Area**: Rounded rectangle container (~620px wide) with:
  - Placeholder text: "How can I help you today?"
  - "+" button (bottom-left of input) -- opens attachment/tools menu
  - Model selector (bottom-right): Shows "Opus 4.6 Extended v" as dropdown
  - Voice button (far bottom-right): Audio waveform icon (||||) for voice input
- **Quick Action Pills**: Row of pill buttons below input area:
  - `</> Code` (code bracket icon)
  - `(pen) Write` (pencil icon)
  - `(grad cap) Learn` (graduation cap icon)
  - `(suitcase) Life stuff` (briefcase icon)
  - `(Google Drive) From Drive` (Google Drive icon)
  - `(Gmail) From Gmail` (Gmail icon -- appears when scrolled/viewport allows)
  - Pills overflow/scroll horizontally based on viewport width
- **Incognito button**: Top-right corner, ghost/phantom icon. Navigates to `?incognito` mode.

### "+" Menu (Toggle Menu)

Opens a vertical dropdown with:

1. **Add files or photos** (paperclip icon)
2. **Take a screenshot** (camera icon)
3. **Add to project** (folder icon, has submenu arrow >)
4. **Add from Google Drive** (Google Drive icon, has submenu arrow >)
5. **Add from GitHub** (GitHub icon) -- only appears when GitHub connector is connected
6. ---separator---
7. **Research** (magnifying glass icon)
8. **Web search** (globe icon, green checkmark when enabled)
9. **Use style** (palette icon, submenu arrow >) -- submenu shows:
   - Normal (checkmark when selected)
   - Learning
   - Concise
   - Explanatory
   - Formal
   - `+ Create & edit styles`
10. **Connectors** (grid icon, submenu arrow >)

Tooltip on "+" hover: "Add files, connectors, and more"

### Model Selector Dropdown

Primary models:

- **Opus 4.6** -- "Most capable for ambitious work" (checkmark when selected)
- **Sonnet 4.6** -- "Most efficient for everyday tasks"
- **Haiku 4.5** -- "Fastest for quick answers"

Toggle:

- **Extended thinking** -- "Think longer for complex tasks" (blue toggle, ON by default for Opus)

Expandable:

- **More models >** -- reveals:
  - Opus 4.5
  - Opus 3
  - Sonnet 4.5

### Incognito Mode

**URL**: `https://claude.ai/new?incognito`

- Greeting changes to: "Greetings, whoever you are"
- Input area has **dotted/dashed border** instead of solid
- Below input: "Incognito chats aren't saved, added to memory, or used to train models."
- Link: "Learn more about how your data is used."
- Close button (X) in top-right corner
- Top banner: "Incognito chat" text

### Design Patterns

- Background: Dark olive/green-brown (`#2a2a23` approximate)
- Text: Off-white/cream
- Input container: Semi-transparent dark overlay with subtle border
- Quick action pills: Outlined/ghost style with rounded corners
- Orange/coral accent color for the starburst icon
- Serif font for the greeting text, sans-serif for everything else
- Warm, earthy color palette throughout

---

## 2. Sidebar Navigation

**Layout**: Two modes -- collapsed (icon-only, ~48px wide) and expanded (~280px with labels).

### Sidebar Items (top to bottom)

| Order | Icon             | Label        | URL          | Notes                                  |
| ----- | ---------------- | ------------ | ------------ | -------------------------------------- |
| 0     | Sidebar toggle   | (top)        | -            | Squares icon to toggle expand/collapse |
| 1     | +                | New chat     | `/new`       | Circle with plus                       |
| 2     | Magnifying glass | Search       | `#` (modal)  | Shows `Cmd+K` shortcut when expanded   |
| 3     | Briefcase        | Customize    | `/customize` | Briefcase with buckle                  |
| ---   |                  |              |              | Visual gap/separator                   |
| 4     | Chat bubble      | Chats        | `/recents`   | Speech bubble icon                     |
| 5     | Folder           | Projects     | `/projects`  | Folder icon                            |
| 6     | Grid of shapes   | Artifacts    | `/artifacts` | 4-piece grid/puzzle icon               |
| 7     | `</>`            | Code         | `/code`      | Code bracket icon                      |
| ---   |                  |              |              | Visual gap                             |
| 8+    | (none)           | Recent chats | `/chat/{id}` | List of recent chat titles (truncated) |

### Bottom Section

- **Downloads link**: Down-arrow icon, "Get apps and extensions" (`/downloads`)
- **User avatar**: Circular avatar with initials "SN", shows name + plan when expanded
  - Expanded shows: "Siddhartha Nagula" + "Max plan"
  - Small up/down chevron arrows for the user menu

### Expanded Sidebar Sections

- **Recents** header label above recent chat list
- Recent chats show truncated titles (e.g., "Top AI desktop apps for developer...")

---

## 3. Search (Cmd+K / Spotlight)

**Trigger**: Click "Search" in sidebar or press `Cmd+K`
**Layout**: Modal overlay centered on screen (~600px wide), light background

### Key Elements

- **Search input**: "Search chats and projects" placeholder, magnifying glass icon, X close button
- **Results list**: Mixed content types, each row shows:
  - Icon: Folder icon (for projects) or chat bubble icon (for chats)
  - Title text
  - Right-aligned metadata: Either owner name ("Siddhartha Nagula") for projects, or timestamp ("Past hour", "Today", "Yesterday", "Past week") for chats
- **Result types**: Searches across both chats AND projects in a single unified list
- **Quick filter**: Projects appear first with folder icons, then chats with bubble icons
- **Keyboard navigation**: Arrow keys to navigate, Enter to select

### Design Patterns

- Light/cream modal background (contrasts with dark page)
- No separate tabs for filtering chats vs projects
- Results appear instantly as you type (no separate search button)

---

## 4. Projects Page

**URL**: `https://claude.ai/projects`
**Layout**: Full-width content area with search bar and card grid

### Key Elements

- **Header**: "Projects" title + "+ New project" button (top-right)
- **Search bar**: "Search projects..." placeholder, full-width, blue focus ring
- **Sort control**: "Sort by: Activity v" dropdown (top-right, below search)
- **Project cards**: 2-column grid layout, each card shows:
  - **Name**: Bold title (e.g., "research")
  - **Description**: Subtitle text (e.g., "research things to be ahead.")
  - **Badge**: "Example project" badge (for demo projects like "How to use Claude")
  - **Updated timestamp**: "Updated 2 days ago" at bottom
  - Card has subtle border, rounded corners, hover effect

### Project Detail View

**URL**: `https://claude.ai/project/{uuid}`

- **Back link**: "<- All projects" at top
- **Project title**: Large text with "..." menu and star (favorite) icon
- **Description**: Below title
- **Chat input**: Same input box as new chat, scoped to project
- **Chat list**: Previous chats within this project, each showing:
  - Title
  - "Last message X hours/days ago"
- **Right panel** (sidebar, ~350px):
  - **Memory** section: "Only you" privacy badge, lock icon, edit button. Shows memory text preview + "Last updated X hours ago"
  - **Instructions** section: "Add instructions to tailor Claude's responses" + "+" button
  - **Files** section: File upload area with illustration, "Add PDFs, documents, or other text to reference in this project." + "+" button

---

## 5. Chats Page

**URL**: `https://claude.ai/recents`
**Layout**: Full-width list view

### Key Elements

- **Header**: "Chats" title + "+ New chat" button (top-right)
- **Search bar**: "Search your chats..." placeholder, full-width, blue focus ring
- **Subtitle**: "Your chats with Claude" + "Select" link (for bulk actions)
- **Chat list**: Vertical list, each item shows:
  - **Title**: Chat title (e.g., "Top AI desktop apps for developers in 2026")
  - **Metadata**: "Last message X minutes/hours/days ago" + optional "in {project name}" for project-linked chats
  - No icons per chat item
  - Full-width rows, clean divider between items

### Design Patterns

- Simple, clean list without cards or thumbnails
- Project attribution shown inline with timestamp
- "Select" mode for bulk operations (delete, etc.)

---

## 6. Artifacts Page

**URL**: `https://claude.ai/artifacts`
**Layout**: Gallery-style page with tabs and category filters

### Key Elements

- **Header**: "Artifacts" title + "+ New artifact" button (top-right)
- **Tabs**: "Inspiration" | "Your artifacts"
- **Category filters** (pill buttons, horizontal row):
  - All (selected by default)
  - Learn something
  - Life hacks
  - Play a game
  - Be creative
  - Touch grass
- **Artifact cards**: 3-column grid, each card shows:
  - **Preview image**: Visual thumbnail/screenshot of the artifact
  - **Title**: Below the image (e.g., "Writing editor", "PRD To Prototype", "Slack Project Insights")
  - Cards have subtle border, rounded corners

### Featured Artifacts (Inspiration tab)

Row 1: Writing editor, PRD To Prototype, Slack Project Insights
Row 2: Raw Note Transformer, Brainstorm Idea Generator, Flashcards
Row 3: (more below fold) CodeVerter, etc.

### Design Patterns

- Visual-first gallery design with large preview images
- Category-based filtering similar to an app store
- Dual tab structure separating community/example artifacts from user-created ones
- Blue/light-blue gradient backgrounds on preview images

---

## 7. Code Page (Claude Code on Web)

**URL**: `https://claude.ai/code`
**Layout**: Completely different UI from main Claude chat. Two-panel layout.

### Key Elements

- **Header**: "Claude Code" text + "Research preview" badge
- **Left panel** (~40% width):
  - "+ New session" button
  - "All projects v" dropdown filter
  - Session history grouped by date ("Today", "Older")
  - Each session shows:
    - Status indicator (circle or play icon)
    - Title (e.g., "Find and fix bugs", "Audit entire codebase")
    - Diff stats in some entries ("+37 -29", "+195 -2")
  - Search icon and filter icon at top
- **Right panel** (~60% width):
  - Crab mascot illustration (pixel-art style, orange/coral)
  - Input area with placeholder: "Find a small todo in the codebase and do it"
  - "+" button and clipboard icon in input toolbar
  - Model selector: "Opus 4.6 v" (right side)
  - Orange circular send button (right side)
  - **"Select a repository"** button below input (GitHub icon + text)
  - **"Default v"** dropdown for project/context selection
- **Bottom banner**: "Try Claude Code on desktop" with "Download" link and X close

### Design Patterns

- Distinct product within Claude.ai with its own navigation
- Code-focused UI with diff stats visibility
- Repository integration prominent
- Pixel art crab mascot (different from main Claude branding)

---

## 8. Customize Page

**URL**: `https://claude.ai/customize`
**Layout**: Left nav sub-menu with main content area

### Main Landing

- **Header**: "Customize" with back arrow
- **Sub-nav** (left panel):
  - Skills
  - Connectors
- **Main content**: Briefcase illustration + "Customize Claude" heading
  - "Skills, connectors, and plugins shape how Claude works with you."
  - Two cards:
    1. **Connect your apps**: "Let Claude read and write to the tools you already use." (grid icon)
    2. **Create new skills**: "Teach Claude your processes, team norms, and expertise." (document icon)

### Skills Sub-page

**URL**: `https://claude.ai/customize/skills`

- **Header**: "Skills" with search icon and "+" button
- **Left panel**: Skill list organized in sections:
  - **My skills** (expandable): Shows user-created skills (e.g., "humanizer" with files: SKILL.md, README.md, WARP.md)
  - **Examples** (expandable): Template skills:
    - algorithmic-art
    - brand-guidelines
    - canvas-design
    - doc-coauthoring
    - internal-comms
    - mcp-builder
    - skill-creator
    - slack-gif-creator
    - theme-factory
    - web-artifacts-builder
- **Right panel** (skill detail view):
  - Skill name + toggle (on/off) + "..." menu
  - Metadata: "Added by: User", "Last updated: Mar 18, 2026", "Invoked by: User or Claude"
  - Description with (i) info icon
  - Skill content preview (rendered markdown) with eye/code toggle buttons
  - Shows "Allowed tools" (e.g., "Read,Write,Edit,Grep,Glob,AskUserQuestion")

### Connectors Sub-page

**URL**: `https://claude.ai/customize/connectors`

- **Header**: "Connectors" with search icon and "+" button
- **Left panel**: Connector list organized by status:
  - **Web** (connected):
    - GitHub (Octocat icon)
    - Gmail (M icon, red)
    - Google Drive (triangle icon, colored)
    - Vercel (triangle icon, black)
  - **Not connected**:
    - Google Calendar (calendar icon, blue)
    - n8n (icon, red)
- **Right panel**: Selected connector detail:
  - Connector logo + name
  - "Disconnect" button (for connected connectors) or "Connect" button

---

## 9. Settings

**URL**: `https://claude.ai/settings`
**Layout**: Left nav tabs + right content area

### Settings Tabs

#### 9a. General (`/settings/general`)

**Sections**:

1. **Profile**:
   - Full name (avatar + text field)
   - "What should Claude call you?" (text field)
   - "What best describes your work?" (dropdown: "Product management")
   - "What personal preferences should Claude consider in responses?" (textarea, applies to all conversations)
2. **Notifications**:
   - "Response completions" toggle (ON) -- notifications for long-running tasks
   - "Emails from Claude Code on the web" toggle (ON) -- email notifications
3. **Appearance**:
   - **Color mode**: Light | Auto (selected) | Dark -- visual card selectors with preview
   - **Background animation**: Enabled | Auto (selected) | Disabled -- card selectors
   - **Chat font**: Default (selected) | Sans | System | Dyslexic friendly -- typography card selectors
4. **Voice settings**:
   - **Voice**: Buttery (selected) | Airy | Mellow | Glassy | Rounded -- card selectors

#### 9b. Account (`/settings/account`)

**Sections**:

1. "Log out of all devices" + "Log out" button
2. "Delete account" (requires canceling subscription first) + "Delete account" button
3. "Organization ID" with UUID + copy button
4. **Active sessions** table:
   - Columns: Device | Location | Created | Updated | Actions (...)
   - Shows all active sessions (Chrome, Safari, Claude iOS, Claude Desktop)

#### 9c. Privacy (`/settings/data-privacy-controls`)

**Sections**:

1. **Privacy header**: Shield icon + "Anthropic believes in transparent data practices"
   - Links: Privacy Center, Privacy Policy
   - "How we protect your data >"
   - "How we use your data >"
2. **Privacy settings**:
   - "Export data" + "Export data" button
   - "Shared chats" + "Manage" button
   - "Memory preferences" + "Manage" link (external)
   - "Location metadata" toggle (OFF) -- coarse location for product improvement
   - "Help improve Claude" toggle (OFF) -- allow data for training

#### 9d. Billing (`/settings/billing`)

**Sections**:

1. **Plan info**: "Max plan" with icon, "20x more usage than Pro", renewal date, "Adjust plan" button
2. **Payment**: "Link by Stripe" with green Stripe icon + "Update" button
3. **Extra usage**:
   - Current balance ($1.50)
   - "Buy more" button
   - "Auto-reload" with "Turn on" button
4. **Invoices** table:
   - Columns: Date | Due | Total | Status | Actions
   - Shows invoice history with "View" links

#### 9e. Usage (`/settings/usage`)

**Sections**:

1. **Plan usage limits**:
   - "Current session" progress bar (19% used, resets in 39 min)
2. **Weekly limits**:
   - "All models" progress bar (95% used, resets in 4 hr 39 min)
   - "Sonnet only" progress bar (17% used, resets Sun 2:00 PM) with (i) info icon
   - "Last updated: just now" with refresh icon
3. **Extra usage**:
   - Toggle to enable extra usage when hitting limits
   - "$0.00 spent" progress bar (0% used, resets Apr 1)
   - "$20 Monthly spend limit" + "Adjust limit" button
   - "$1.50 Current balance" + "Auto-reload off" link + "Buy more" button

#### 9f. Capabilities (`/settings/capabilities`)

**Sections**:

1. **Memory**:
   - "Search and reference chats" toggle (ON) -- search past chats for context
   - "Generate memory from chat history" toggle (ON) -- auto-memory from chats
   - "Memory from your chats" card: Shows preview + "Updated 4 days ago from your chats"
   - "Import memory from other AI providers": "Start import" button
2. **Tool access**:
   - "Tool access mode" radio buttons:
     - "Load tools when needed" (selected) -- "Chats compact less since tools aren't pre-loaded"
     - "Tools already loaded" -- "Chats compact more often since tools are always there"
3. **Visuals**:
   - "Artifacts" toggle (ON) -- generate code snippets, text docs, website designs
   - "AI-powered artifacts" toggle (ON) -- apps/prototypes using Claude API inside artifact
   - "Inline visualizations" toggle (ON) -- charts, diagrams directly in conversation
4. **Code execution and file creation**:
   - Main toggle (ON) -- execute code, create docs/spreadsheets/presentations/PDFs
   - "Allow network egress" toggle (ON) -- install packages, advanced analysis
   - "Domain allowlist" dropdown: "All domains" (default)
5. **Skills**:
   - "Skills have moved to Customize" banner + "Go to Customize" button

#### 9g. Connectors (`/settings/connectors`)

**Sections**:

1. Banner: "Connectors will move to the new Customize page" + "Go to Customize" button
2. **Connectors list** with icons, names, and status:
   - Google Drive: Connected
   - GitHub: Connected
   - Gmail: Configure
   - Vercel: Configure
   - Google Calendar: Connect
   - n8n: Connect
3. "Add custom connector" button at bottom
4. Each connector has "..." actions menu

#### 9h. Claude Code (`/settings/claude-code`)

**Sections**:

1. **Gift a week of Claude Code**:
   - Guest pass card with crab mascot (pixel art)
   - "0/3 left" guest passes
   - Referral link with "Copy link" button
   - "Friends can try both Cowork and Claude Code."
2. **Claude Code**:
   - Description + crab terminal illustration
   - "Install instructions here" link
   - Info box: "How does usage work? When you sign in to Claude Code using your subscription, your subscription usage limits are shared with Claude Code."
3. **Manage your authorization tokens** section

---

## 10. Chat Interface (Input Area Details)

**URL**: `https://claude.ai/new`

### Input Area Anatomy

1. **Text input**: Multi-line textarea, placeholder "How can I help you today?"
2. **"+" button** (left of toolbar row): Opens attachment/features menu
3. **Model selector** (right of toolbar row): "Opus 4.6 Extended v" -- dropdown
4. **Voice button** (far right of toolbar row): Waveform/bars icon for voice input
5. **Send button**: Only appears when text is entered (orange/coral arrow icon)

### Quick Action Pills (below input)

Horizontally scrollable row of outlined pill buttons:

- `</> Code` -- Code bracket icon
- `(pen) Write` -- Pencil/edit icon
- `(grad cap) Learn` -- Graduation cap icon
- `(suitcase) Life stuff` -- Briefcase icon
- `(Google Drive) From Drive` -- Google Drive colored icon
- `(Gmail) From Gmail` -- Gmail colored icon

These pills likely pre-fill the input with category-specific prompts.

---

## 11. User Menu

**Trigger**: Click user avatar/initials (SN) at bottom-left of sidebar

### Menu Items (top to bottom)

1. **Email**: `siddharthanagula3@gmail.com` (non-clickable, header)
2. **Settings** -- Gear icon, shortcut `Shift+Cmd+,`
3. **Language** -- Globe icon, submenu arrow >
4. **Get help** -- Question mark circle icon
5. ---separator---
6. **View all plans** -- List/cards icon
7. **Get apps and extensions** -- Download icon
8. **Gift Claude** -- Gift box icon
9. **Learn more** -- Info circle icon, submenu arrow >
10. ---separator---
11. **Log out** -- Arrow-out-door icon

---

## Design System Summary

### Color Palette

- **Background**: Dark olive/brown-green (#2a2a23 to #3a3a2f range)
- **Text primary**: Off-white/cream (#e8e0d4 approximate)
- **Text secondary**: Muted cream/gray (#a0987e approximate)
- **Accent**: Orange/coral (starburst icon, send button)
- **Interactive blue**: Blue focus rings, blue toggle switches, blue progress bars
- **Green**: Web search enabled checkmark
- **Red**: High usage progress bars (95%+ fills)

### Typography

- **Greeting**: Serif font (literary/editorial feel)
- **UI elements**: Sans-serif (system or custom)
- **Code/technical**: Monospace font
- Chat font customizable: Default, Sans, System, Dyslexic friendly

### Component Patterns

- **Cards**: Rounded corners (~12px), subtle border, slight hover elevation
- **Buttons**: Outlined/ghost style for secondary, filled for primary
- **Toggles**: Pill-shaped toggle switches (blue = ON, dark = OFF)
- **Progress bars**: Horizontal fill bars with percentage labels
- **Modal overlays**: Light/cream background for search modal
- **Dropdown menus**: Dark background, slight elevation shadow
- **Pill filters**: Rounded pill buttons for category selection

### Layout Patterns

- Collapsible sidebar (icon-only or expanded with labels)
- Full-width content areas for list views (Chats, Settings)
- Card grids for gallery views (Projects, Artifacts)
- Split-panel for detail views (Project detail, Skill editor, Connector detail)

### Unique Features (Competitive Differentiators)

1. **Incognito mode** -- Built into the main chat with visual differentiation (dotted borders)
2. **Skills system** -- Custom instructions with file-based structure (SKILL.md), allowed tools, invocation rules
3. **Memory system** -- Auto-generates from chats, importable from other AI providers
4. **Extended thinking toggle** -- Per-conversation toggle in model selector
5. **Dynamic greetings** -- Time-of-day contextual greeting text
6. **Quick action pills** -- Category shortcuts below input (Code, Write, Learn, etc.)
7. **Connector integration** -- Native Google Drive, Gmail, GitHub, Vercel, Calendar, n8n
8. **Tool access mode** -- Choice between lazy-loading and pre-loading tools
9. **Code execution sandbox** -- Network egress controls, domain allowlists
10. **AI-powered artifacts** -- Artifacts that use Claude API internally
11. **Background animation** -- Toggleable animated background effects
12. **Guest passes** -- Gift Claude Code access to friends (3 passes)
13. **Voice settings** -- 5 named voice personas (Buttery, Airy, Mellow, Glassy, Rounded)
14. **Inline visualizations** -- Charts/diagrams rendered directly in chat
15. **Session management** -- Active sessions table showing all devices/locations
16. **Claude Code on web** -- Full coding agent with repo selection, diff tracking
