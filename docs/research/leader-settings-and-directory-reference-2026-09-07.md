# claude.ai and chatgpt.com settings, directory, composer and sidebar reference (observed 2026-09-07)

Status: Current
Owner: Product (founder) and the parity agents
Last updated: 2026-09-07

Every statement here was observed first hand on 2026-09-07 in the founder's signed-in Chrome sessions (claude.ai on Max, chatgpt.com on Plus), driven through Playwright over the live browser. Every menu, tab, dropdown, dialog and detail view named below was opened and read; nothing was installed, toggled, removed or submitted. Account values (names, emails, ids, card digits, addresses, session locations, memory contents) were seen and are deliberately not recorded. This file extends `leader-ui-reference-2026-09-04.md` and `claude-ai-ui-reference-2026-09-03.md`; where they differ, this file is newer. Section 5 compares each surface with our web app as it is in code today (`apps/web`, `packages/ui`) and section 6 is the build order.

Reading key: "switch" is a toggle, "select" is a dropdown with a closed list, "row" is a labelled line that opens something on click, "menu" is a popover list.

## 1. claude.ai settings modal

Opened from the account menu (Settings, shortcut Shift+Cmd+comma), from the sidebar Customize link, or from a hash. Every pane owns a hash and every detail owns a longer hash, so any state is a link:

| pane             | hash                                                                                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General          | `#settings/general`                                                                                                                                                                                                                                              |
| Account          | `#settings/account`                                                                                                                                                                                                                                              |
| Privacy          | `#settings/data-privacy-controls`                                                                                                                                                                                                                                |
| Billing          | `#settings/billing`                                                                                                                                                                                                                                              |
| Usage            | `#settings/usage`                                                                                                                                                                                                                                                |
| Capabilities     | `#settings/capabilities`                                                                                                                                                                                                                                         |
| Claude Code      | `#settings/claude-code`                                                                                                                                                                                                                                          |
| Cowork           | `#settings/cowork`                                                                                                                                                                                                                                               |
| Claude in Chrome | `#settings/browser-extension`                                                                                                                                                                                                                                    |
| Skills           | `#settings/customize-skills`, skill detail `#settings/customize-skills/<name>`                                                                                                                                                                                   |
| Connectors       | `#settings/customize-connectors`, detail `#settings/customize-connectors/<id>`, directory `#settings/customize-connectors/directory`, all `#settings/customize-connectors/directory/all`, directory detail `#settings/customize-connectors/directory/all/<slug>` |
| Plugins          | `#settings/customize-plugins`, detail `#settings/customize-plugins/<plugin>%40<marketplace>`, detail tab `#settings/customize-plugins/<id>/skills`, skill inside plugin `#settings/customize-plugins/<id>/skill%3A<plugin>%3A<skill>`                            |
| Memory           | `#settings/memory`                                                                                                                                                                                                                                               |

Closing the modal returns the URL to the page (`/new`). The nav has two labelled groups, Settings (General, Account, Privacy, Billing, Usage, Capabilities, Claude Code, Cowork, Claude in Chrome) and Customize (Skills, Connectors, Plugins, Memory), plus a Search field that filters the nav.

### 1.1 General

- Profile: Avatar (letter tile, Randomize avatar), Full name, "What should Claude call you?" (display name), "What best describes your work?" select with Product management, Engineering, Human resources, Finance, Marketing, Sales, Operations, Data science, Design, Legal, Scientist, Student, Founder, Healthcare, Writer, Educator, Consultant, Researcher, Software engineer, Other.
- "Instructions for Claude" textarea. Copy: "Claude will keep these in mind for this and any of your associated accounts across chats and Cowork within Anthropic's guidelines. Learn more". Placeholder: "e.g. keep explanations brief and to the point".
- Preferences: Appearance (theme segmented control), Chat font picker (Anthropic Serif, Anthropic Sans, System, Dyslexic friendly), Motion (System | Reduced; copy "Reduce animation in streaming responses and other interface elements.").
- Voice: Language select (English, English (India), English (United Kingdom), Chinese (Simplified), Cantonese, French, French (Canada), German, German (Austria), Hindi, Italian, Japanese, Korean, Portuguese, Portuguese (Brazil), Portuguese (Portugal), Russian, Spanish, Spanish (Latin America), Turkish, Ukrainian), Style select (Buttery, Airy, Mellow, Glassy, Rounded), Speed select (Slow, Normal, Fast).
- Notifications, five switches each with one line of copy: Response completions ("Get notified when Claude has finished a response. Useful for long-running tasks."), Code notifications, Code permission requests, Emails from Claude Code on the web, Dispatch messages.

### 1.2 Account

- "Log out of all devices" row with Log out.
- Delete account row; when a subscription is active the copy says to cancel it first and the button stays visible.
- Organization ID with a Copy button.
- Trusted devices: copy "Devices that can control your local machine through remote sessions." and an empty state "No trusted devices."
- Active sessions table: Device | Location | Created | Updated, the current row marked "Current", a per-row "Session actions" menu.

### 1.3 Privacy

- Intro copy with Privacy Center and Privacy Policy links; two expandable rows "How we protect your data" and "How we use your data".
- Preferences switches: Location metadata ("Allow Claude to use coarse location metadata (city/region) to improve product experiences."), Help improve our AI models ("Allow the use of your chats and coding sessions to train and improve Anthropic AI models."), each with Learn more.
- Your data: Export data (button), then rows with a Manage button: Shared chats, Shared artifacts, Uploaded files, Your feedback, Memory preferences.

### 1.4 Billing

- Plan card: plan name, tagline ("20x more usage than Pro"), Adjust plan link (`/upgrade?from=billing`), cancellation notice with Resubscribe when scheduled.
- Payment: card brand and last four, Update.
- Invoices table: Date | Total | Status | Actions (View opens the Stripe hosted invoice).

### 1.5 Usage

- "Plan usage limits" with the plan badge; Current session (Resets in, percentage bar); Weekly limits with a boost notice, an "All models" row and per-model rows (reset day and time, percentage); "Last updated" with a Refresh button and a Learn more link.
- Usage credits: switch ("Turn on usage credits to keep using Claude if you hit a plan limit."), spent amount, reset date, percentage of a cap, Monthly spend limit with Adjust limit, Current balance, Auto-reload (Off, button), Buy usage credits ("Up to 30% off"), Spending cap information.

### 1.6 Capabilities

- General: Tool access mode select with two described options, "Load tools when needed" ("Chats compact less since tools aren't pre-loaded.") and "Tools already loaded" ("Chats compact more often since tools are always there."); copy under the label "Controls how connector tools are loaded in new conversations."
- Connector search switch: "Let Claude search the connector directory and surface ones relevant to your conversation."
- Switch models when a message is flagged (switch): "When safeguards flag a message, automatically switch to a different model to keep chatting. When off, your chat will pause instead."
- Visuals: Artifacts, AI-powered artifacts, Inline visualizations (switches with one line each).
- Code execution and file creation: "Cloud code execution and file creation" switch ("... Required for skills."), "Allow network egress" switch with a security warning link, Domain allowlist select (None, Package managers only, All domains) with "View package manager domains", Additional allowed domains input ("example.com or \*.example.com") with Add.
- Skills: "Skills have moved to Customize." with a link.

### 1.7 Claude Code

- General: Classify session states (switch), Switch models when a message is flagged (switch).
- Code appearance: Light code theme select (Claude Light, GitHub Light, Pierre Light, One Light, Catppuccin Latte, Solarized Light, Vitesse Light, Min Light, Rose Pine Dawn, Slack Ochin), Dark code theme select, Code font input ("e.g. JetBrains Mono").
- Appearance: Interface font (Anthropic Sans | System), Transcript text size (Small | Medium | Large), Transcript width (Narrow | Medium | Wide).
- Pull requests: Branch prefix input, Create pull requests automatically (switch), Auto-fix pull requests (switch).
- Authorization tokens table: Application | Scopes, "Revoke access" per row, pagination "Showing 1 to 5 of N", Previous page, Next page.
- Claude Code (CLI, Desktop, IDE): "Delete sessions stored by Anthropic" with Delete...; Sharing settings with Manage.

### 1.8 Cowork

- Require trusted devices (switch, Learn more), Only on your computer (switch, link), Preferred browser select (Built-in browser | Chrome (Claude in Chrome)), Global instructions (copy plus Edit).

### 1.9 Claude in Chrome

- Beta badge, Enable Claude in Chrome (switch), Site permissions: "Default for all sites" select (Allow all sites | Block all sites).

### 1.10 Memory

- Switches: Search and reference chats, Generate memory from chats, Include sensitive topics in memory, each with copy and Learn more.
- Import memory from other AI providers: copy plus Start import.
- A migration banner with an "export legacy memory" link.
- Memory tables grouped You / Topics / Areas: Name | Summary | Last updated | Actions (Edit memory, Delete).
- A composer at the bottom, "Tell Claude what to change or remove", with Send message.

### 1.11 Skills pane

- Header: Skills, a search icon that expands to "Search skills", Browse (opens the Directory), Add menu (Upload skill, Create a skill, Create with Claude, Watch the intro video).
- Table: Skill | Last updated | Author, one row per user-owned or installed skill.
- Footer: "Add skills to extend Claude's capabilities." with Add skill and Learn more.
- Skill detail: breadcrumb Skills > name, "by <author>", Enable skill switch, Details, "More options" menu (Try in chat, Remove), sections Overview | Contents (file count), Description, "Slash command /<name>", More info.

### 1.12 Connectors pane

- Header: Connectors, search, Add menu (Browse connectors, Add custom connector).
- Popular strip: Gmail, Google Drive, Slack cards each with "View <name> details" and "Connect <name>".
- Filter row All | Connected | Not connected above a table Connector | Type | Status (Web, Connected or Connect).
- Detail, half-finished OAuth: "You started connecting to Gmail but didn't finish.", "This connector is required by the following plugins:" with the plugin names, Connect, "More options" menu (View details, Remove).
- Detail, never connected: "You're not connected to <name> yet." with Connect and the same menu.
- Detail, first-party integration (GitHub): Disconnect, a description and a bullet list of what the integration powers across products.

### 1.13 Plugins pane

- Header: Plugins, search, Browse, Add menu (Add marketplace, Upload plugin, Create a plugin, Create with Claude).
- Table: Plugin | Author | Skills (count) | Last updated.
- Detail: breadcrumb Plugins > name, "More options" menu (Remove), Customize button (leaves Settings and pre-fills the composer with "Customize the "<id>" plugin for me based on my company" under a caution banner), Enable plugin switch, facts Source (Marketplace (Anthropic & Partners), link), Version, Author, Last updated, Description; tabs Skills | Connectors.
- Skills tab copy: "Invoke by typing / in chat, or let Claude use them automatically for relevant tasks." then one button per skill as `/name` plus its full description, and a "Search skills" field.
- Connectors tab copy: "Tools and data sources this plugin connects to. Connect each one so Claude can use it." then rows of connector name with Install (not added yet) or a CUSTOM badge with Connect.
- Skill inside a plugin: breadcrumb plugin > skill, "by <author> · <plugin> plugin", Details, More options, See more, file picker ("SKILL.md", "N files"), the rendered SKILL.md, Copy.

## 2. claude.ai Directory (Browse)

A second dialog titled "Directory" over Settings, hash unchanged. Left nav: Skills, Connectors, Plugins. Search per section. Right: Filter by, Sort by, and for plugins a "+" (Add marketplace).

### 2.1 Plugins

- Tabs Anthropic | Partners. Anthropic lists 16 plugins; Partners lists 78.
- Filter by: Status (Installed, Not installed); on Partners also Category (automation, database, deployment, design, development, finance, learning, monitoring, productivity, security, testing). Sort by: Most popular, Recently updated, Name A-Z.
- Card: icon, name, publisher, install count ("2.5M installs"), two-line description; right affordance is a gear ("Manage") when installed or a plus ("Install") when not.
- Card detail: Back, name, "by <publisher>", "View on claude.com", Copy link, Remove, Manage; description; "Try asking..." with four example prompts; "Skills N" listing `/name` buttons; "Connectors N" with copy "External services and tools connected via the Model Context Protocol (MCP)." and connector chips with "+N more".
- Manage (gear or detail button) closes the Directory and opens the Settings plugin detail; a `/skill` button opens the Settings detail on its Skills tab. The Directory is the browse and install surface; every manage action lands in Settings.
- "+" opens "Add marketplace" with two rows and Cancel: "Browse Anthropic sources" ("Curated marketplaces of plugins from Anthropic and partners") and "Add from a repository" ("Sync a plugin marketplace from a GitHub repository or Git URL").
- Browse Anthropic sources: title "Anthropic sources", copy "Curated by Anthropic. Choose which sources to include.", rows of name, repository slug and Add or Added: Knowledge Work (anthropics/knowledge-work-plugins), Life Sciences (anthropics/life-sciences), Financial Services (anthropics/financial-services), Legal (anthropics/claude-for-legal), Claude Tag (anthropics/claude-tag-plugins), Healthcare (anthropics/healthcare); Done.
- Add from a repository: a GitHub picker with "Search GitHub or paste a repository URL", listing the accounts and organisations the user's GitHub connection can see, with Load more.

### 2.2 Skills

- One tab, Anthropic. Search "Search skills...". Filter by Status (Installed, Not installed). Sort by Most popular, Recently updated, Name A-Z.
- Card: `/name`, publisher, install count, the full description (not clamped), gear when installed, plus when not. Observed: /web-artifacts-builder 1.3M, /skill-creator 152.5K, /morning 12.3K, /import-memory 4.2K, /canvas-design 2M, /learn 1.1M, /mcp-builder 1.1M, /theme-factory 1M, /brand-guidelines 901.4K, /doc-coauthoring 893.3K, /internal-comms 685.2K, /algorithmic-art 671.4K.
- Detail: Back, name, publisher, Copy link, Uninstall or Install, a file tree (SKILL.md, folders with files, LICENSE.txt) where each file renders in place, Description, License line, the rendered SKILL.md with "Copy to clipboard" on code blocks, More info.

### 2.3 Connectors

Connectors do not use the Directory dialog. "Browse connectors" opens a directory inside Settings at `#settings/customize-connectors/directory`.

- Breadcrumb "Connectors / Directory", Copy link, search "Search connectors", one "Filter: All" menu.
- Sections "Top connectors" (12 cards, "Show all 2419") and "Trending connectors" ("Show all 10", cards carry a Trending badge). Card: logo, name, one-line description, "Connect to Claude".
- Filter menu: Category (All, Code 438, Communication 244, Data 897, Design 164, Financial services 281, Health 29, Legal 100, Life sciences 44, Productivity 1225, Sales and marketing 580) and Type (All, Trending 10, New 231, Verified 773, Community 1646, In-chat UI 302, Desktop extensions 127). No sort control.
- "Show all" is `.../directory/all`, a flat list with the same filter.
- Detail (`.../directory/all/<slug>`): Copy link, name, one-liner, "Connect to Claude", long description, Tools (tool names), the trust notice "Only use connectors from developers you trust. Anthropic does not control which tools developers make available and cannot verify that they will work as intended or that they won't change.", facts CATEGORY (button that filters), MADE BY (link), SIGN-IN (Required), CONNECTOR URL with "Copy server URL", ADDED (month), MORE INFO (Documentation, Support, Privacy Policy), "Related connectors" (six cards), and the footer "Submission to the Directory is governed by the Software Directory Terms; use of Connectors is governed by your relevant terms."
- Add custom connector, "Step 1 of 2": copy "Connect Claude to your data and tools. Learn more about connectors or get started with pre-built ones."; Name ("Shown in the connectors list."); Remote MCP server URL ("The HTTPS address where the server accepts MCP requests, for example https://mcp.example.com/mcp."); Authentication radios Always required ("Each user signs in through the server's OAuth flow before they can use any tools or resources.", default), Required when the server asks ("Claude connects without credentials first and prompts users to sign in when the server asks. Pick this for servers that offer some tools without an account."), None; Client registration radios Use Anthropic's hosted client metadata (Recommended, CIMD, default), No client ID (register one automatically, DCR), Static per installation; "Add header", "Advanced", two "More info" toggles; the trust notice; "Building an MCP server? Report issues and subscribe to updates here"; Cancel, Continue. Step 2 was not opened because it submits.

## 3. claude.ai composer and sidebar

- Composer face: "Add files, connectors, and more" (+), "Model: <name>", Dictate, Voice input; Chat | Cowork toggle above the field.
- Plus menu (from the founder's captures and this walk): Add files or photos (Cmd+U), Take a screenshot, Add to project (submenu), Add from GitHub; Skills (submenu: the user's own skills by name, then Manage skills, Browse skills); Add connector (submenu: Browse connectors, Add custom connector); Plugins (submenu: installed plugins by name each with a nested chevron, then Manage plugins, Browse plugins); Research; Web search (check); Memory (check).
- "/" in the composer: first row "Add files", then the user's own skills, then each installed plugin as a group header with its skills, names only.
- Model picker: Fable 5.1 ("For your toughest challenges"), Opus 5 ("For complex tasks"), Sonnet 5 ("Most efficient for everyday tasks"), Haiku 4.5 ("Fastest for quick answers"); Effort (Off; submenu Extended "Always uses deep reasoning"); More models (Fable 5, Opus 4.8, Opus 4.7, Opus 4.6, Opus 3, Sonnet 4.6).
- Sidebar: brand, New (Shift+Cmd+O), Quick task, Projects, Artifacts, Scheduled, Customize; Projects group (All projects, Create project, rows with "More options for <project>": Unpin, Edit details, Archive, Delete); Pinned; "Chats and tasks" (View all, "Filter and group recents": Type, Status, Last activity, Group by, Sort by, Reset to defaults; rows with "More options": Open as quick task, Copy session ID, Pin (P), Mark as read (U), Rename (R), Add to project, Move to group, Archive (A), Delete (D)); bottom: Design, account button "<name> · <plan>", "Get apps and extensions", Search, Hide sidebar.
- Account menu: email, Settings (Shift+Cmd+comma), Language, Get help, plan action (Resubscribe to Max), Get apps and extensions, Claude Academy (New), Get API keys (on Claude Platform), Log out.
- `/customize` redirects to `#settings/customize-skills`.

## 4. chatgpt.com

### 4.1 Settings modal (`#settings/<Tab>`)

Seventeen tabs: General, Notifications, Personalization, Plugins, Voice, Billing, Usage, Analytics, Data controls, Cloud browser, Storage, Safety, Security and login, Parental controls, Trusted contact, Account, Keyboard.

- General: Appearance select, Contrast select, Accent color select, Language select (Auto-detect), Higher intelligence switch ("ChatGPT can automatically use a higher intelligence setting when you ask a complex question."), Enable Dictation switch ("Use dictation in the chat composer.").
- Notifications: one row per category with a channel picker button (Push, Email, or Push, Email): Codex, Group chats, Health, Library, Marketing, Personalized tips, Projects, Responses, Tasks (with Manage tasks), Usage.
- Personalization: Base style and tone (Default, Professional, Friendly, Candid, Quirky, Efficient), Characteristics (Warm, Enthusiastic, Headers & Lists, Emoji, each Less / Default / More), Fast answers switch, Suggested prompts switch, Custom instructions textarea, Pet (Select pet), About you (Nickname, Occupation, More about you), Memory (Enable memory switch, Memory summary Manage, saved memories link), Writing (Reference my writing style switch, Set up writing style), Record mode (Reference record history switch), Advanced.
- Plugins: "Manage plugins you've installed"; Permissions row ("Choose when ChatGPT should ask for permission when using plugins.", value "Allow low-risk actions"); one row per installed plugin with a state badge (none, Allow all, Always ask, Multiple, Reconnect); footer links Browse plugins (`/plugins`) and Developer mode.
- Global Permissions dialog: Chat | Work scope, radios Always ask ("ChatGPT will ask before reading or making changes."), Allow read actions ("ChatGPT can read without asking, but will ask before making changes."), Allow low-risk actions ("ChatGPT will automatically approve low-risk actions but may deny actions involving sensitive information.").
- Plugin detail (`#settings/Plugins/<id>`): Back, name, tagline, "Plugin actions" menu (View plugin detail, Disconnect), Connection (account or source), Permissions row (per plugin), Used by (dependent plugins), Skills, then tool groups "Read actions" and "Write actions" listing every tool with its full description.
- Per-plugin Permissions dialog: Reset, radios Always ask, Allow read actions, Allow low-risk actions (DEFAULT badge), Allow all actions (ELEVATED RISK badge, "ChatGPT won't ask before reading or taking action. This comes with elevated risk.").
- Voice: voice carousel (Previous voice, Next voice, name and one-line character), Model select, Intelligence select, Language select.
- Billing: plan card with the renewal sentence and Compare plans; Wallet balance with Redeem gift card; Transaction history rows with invoice links; Billing information (Edit: billing email, name, address); Payment methods (Add new, rows with Default and an actions menu); Cancel plan.
- Usage: plan-limit copy (shared across Codex, Work, Workspace Agents and ChatGPT for Excel; chat excluded), out-of-usage banner (add credits, upgrade), 5-hour limit and Weekly limit rows (Resets in, percent left), "Usage limit resets" list with Use reset and expiry, Credits (credits left, Add more, Automatic reload switch "Save up to 40%", Buy credits for someone else, Gift credits).
- Analytics: Usage history (7d | 30d, By product | By model, stacked bars), Product activity (turns by model or surface), Tool activity (Plugin calls, Skills used), Code review (Issues found, PRs reviewed, Issues by priority).
- Data controls: Improve the model for everyone (row), Location (Turn on), Information shared with apps (row), Work network access (row), Reset ChatGPT Work (Reset), Shared links (Manage), Archived chats (Manage), Archive all chats, Delete all chats, Export data (Export), Marketing privacy (row).
- Cloud browser: Default permissions select (Always allow; "Choose if ChatGPT asks for approval before opening websites."), Site permissions (Add site), Browser data: Cookies, About cloud browser.
- Storage: "X of 20 GB used", Manage storage, rows Files (size, count) and Images (size, count).
- Safety: Reduce sensitive content switch.
- Security and login: Password (Add), Security keys & passkeys (row), Multi-factor authentication (Authenticator app switch, Text message switch), Sessions (Active sessions row), Advanced security (Advanced account security Enroll, Lockdown mode switch, Developer mode switch with ELEVATED RISK, Enforce CSP in developer mode switch, Secure sign in with ChatGPT row), Codex CLI (Disconnect), Enable device code authorization for Codex switch.
- Parental controls (Add family member), Trusted contact (Add contact).
- Account: Name, Username, Email, Delete account; GPT builder profile (preview, Name, Links, Email, Receive feedback emails, Hide your name switch).
- Keyboard: editable shortcut rows in two groups, Composer (Send message or stop answering, Send message in background, Select effort, Toggle dictation, Add photos & files) and App (Open new chat, Show shortcuts, Search, Toggle dev mode, Toggle sidebar, Set custom instructions, Copy last code block, Delete chat), each with an enable switch, a key-sequence input and Change key sequence; Restore defaults.

### 4.2 Browse plugins (`/plugins`, a page)

- Tabs Plugins | Skills, headline "Work with ChatGPT across your favorite tools.", search "Search plugins".
- "Installed" strip of chips ("N more" opens Settings > Plugins), then curated rows Popular, New & Noteworthy, Productivity, Creativity, Developer Tools, Business & Operations, Data & Analytics, Communication, each ending in "See A, B, and more" (`/plugins?category=<slug>`). Cards: name, one-line tagline; installed cards carry an "Actions for <name>" menu (Chat, Manage, Uninstall).
- Category page: title, one line of copy, a flat grid, no filters.
- Plugin page (`/plugins/<id>`): breadcrumb, name, tagline, Plugin actions, Try in chat, three "@Name ..." example prompts, long description, facts (Information, Capabilities such as Interactive, Write, Developer, Category, Website, Version, Privacy Policy, Terms of Service), a data-sharing paragraph, and for Google connectors a "Note on Google apps".
- Skills tab (`/skills`): "Instructions that extend ChatGPT's capabilities.", empty state "You don't have any skills yet" with Create. There is no public skills directory on chatgpt.com.

### 4.3 Composer and sidebar

- Composer face: "Add files and more" (+), one pill for model and effort (model name plus "High"), Start dictation, send. Chat | Work toggle above; an out-of-usage banner with Add credits and Upgrade.
- "+" and "@" open the same flat palette: Add photos & files, Add from library, Create image, Web search, Deep research, then installed plugins with taglines (a not-yet-connected plugin shows Connect on the right), and a bottom search "Type to search plugins, files, folders & skills".
- "/" opens a command palette: Add photos & files, Dictate, Feedback, Model (submenu), Move to project (submenu), Personalization, Intelligence (submenu), Settings, Temporary chat.
- Model picker: model header with a five-step power slider ("Consumes usage limits faster"), Enable fast mode, Reset to default, "Select model" list under "Default, Recommended set of models" (the current flagship and four recent releases, names only).
- Sidebar rail: Open sidebar, New chat, Search, Recents, a credits pill, a 5-hour pill and a Weekly pill (both open Usage), profile. Expanded: Home, Search, Close sidebar, New chat (Shift+Cmd+O), Library, Scheduled, Plugins, More; Projects (New project, Organize chats: In one list | By project; rows with Open project home and Open project options: Share project, Rename project, Project settings, Project home, Pin project, Delete project); Chats (rows with Pin and "Open conversation options": Share, Rename, Pin chat, Archive, Delete, Move to project).
- Account menu: name and plan, Upgrade plan, Personalization, Profile, Settings, Help, Log out.

## 5. Gap table against our web app (code on 2026-09-07)

Our modal: `apps/web/features/settings/components/WebSettingsModal.tsx` with `SETTINGS_NAV_GROUPS_WEB`, 18 flat rows (general, account, team, privacy, billing, usage, capabilities, memory, security, safety, notifications, voice, reflect, time-focus, skills, connectors, plugins, help). Directory sections render through `packages/ui/ui/src/directory/DirectoryPanel.tsx` and `apps/web/features/directory/hooks/useDirectoryAdapter.ts`.

| surface                                                                                             | claude.ai / chatgpt.com                                                                                                                                                                    | ours today                                                                                                                                              | gap                                                                                                                                                                                                                      | priority |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Nav grouping                                                                                        | Two labelled groups (Settings, Customize)                                                                                                                                                  | One flat list, no labels                                                                                                                                | Add group labels Settings and Customize; move skills, connectors, plugins, memory under Customize                                                                                                                        | P1       |
| Hash per pane                                                                                       | Every pane and detail has a hash                                                                                                                                                           | Only the three directory sections have hashes; other panes never write the URL                                                                          | Give every section a hash slug and every detail a hash; parse on open                                                                                                                                                    | P1       |
| Plugins pane (manage)                                                                               | Table Plugin, Author, Skills, Last updated; Browse; Add menu (Add marketplace, Upload plugin, Create a plugin, Create with Claude)                                                         | One directory view mixing Installed and catalogue; "+" only opens Add marketplace                                                                       | Add an Installed table view with Browse and an Add menu; Upload plugin and Create a plugin need routes (see 6.3)                                                                                                         | P1       |
| Plugin detail (manage)                                                                              | Enable switch, Source, Version, Author, Last updated, tabs Skills and Connectors, Remove, Customize                                                                                        | Enable switch, per-skill switches, required connectors list, Includes, Try asking, Works with, Version                                                  | Add Source and Last updated, split Skills and Connectors into tabs with the leader copy, Connectors tab with Install or Connect per row                                                                                  | P2       |
| Directory (browse)                                                                                  | Separate Directory dialog with Anthropic and Partners tabs, install counts, gear or plus per card, Copy link, View on claude.com                                                           | Same page as manage; tabs Built in, Partners, Marketplace; no install counts on cards; plus or minus per card                                           | Show install counts where the registry has them; use a gear for installed; add Copy link on details                                                                                                                      | P2       |
| Add marketplace                                                                                     | Two-path dialog: Browse Anthropic sources (curated list with Add or Added) and Add from a repository (GitHub picker)                                                                       | Two-path dialog exists; Browse sources only if the adapter supplies `onBrowseSources`; repository step is a URL plus branch form                        | Supply a curated sources list (our own first-party marketplaces) and a GitHub repository picker from the GitHub installation                                                                                             | P2       |
| Skills pane (manage)                                                                                | Table Skill, Last updated, Author; Browse; Add menu (Upload skill, Create a skill, Create with Claude, Watch the intro video); detail with Enable switch, Try in chat, Remove              | Directory view with Made by AGI and Yours tabs and a New skill button; detail with file tree, Install or Uninstall, Delete skill                        | Add the installed table with Browse and the Add menu (Upload skill via zip, Create a skill via the authoring form, Create with Claude opens the composer with a prompt); add Try in chat and Enable switch to the detail | P1       |
| Skills directory                                                                                    | Install counts, Sort by, full description on card                                                                                                                                          | Same layout, no counts, sort present                                                                                                                    | Counts when data exists; otherwise done                                                                                                                                                                                  | P3       |
| Connectors pane (manage)                                                                            | Popular strip with View details and Connect; filters All, Connected, Not connected; table Connector, Type, Status; Add menu (Browse connectors, Add custom connector)                      | Directory list with Connected group and Top connectors; Add custom connector as a header button; no Connected filter                                    | Add the All, Connected, Not connected filter and the Add menu; the table can stay cards                                                                                                                                  | P2       |
| Connector detail states                                                                             | Half-finished OAuth copy with "required by the following plugins"; never connected copy; first-party integration copy                                                                      | Connect, Disconnect, Tools, facts, related                                                                                                              | Add the "required by these plugins" block (data exists in plugin required connectors) and the half-finished OAuth state                                                                                                  | P2       |
| Connectors directory filter                                                                         | Category with counts and Type (Trending, New, Verified, Community, In-chat UI, Desktop extensions)                                                                                         | Category filter, Official and Community tabs, desktop toggle                                                                                            | Add Trending and New facets with counts; counts in filter labels                                                                                                                                                         | P3       |
| Custom connector form                                                                               | Two-step wizard with Authentication and Client registration radios, Add header, Advanced                                                                                                   | One form: JSON paste, Name, optional bearer token, URL                                                                                                  | Add the authentication choice (OAuth always, on demand, none) and client registration (hosted metadata, DCR, static) once the MCP client supports them; keep our JSON paste                                              | P3       |
| Composer plus menu                                                                                  | Skills submenu lists own skills; Add connector submenu (Browse, Add custom); Plugins submenu lists installed plugins with nested skills                                                    | Skills and Plugins submenus landed 2026-09-07 (b3080b93e, 0750f5c96); Connectors submenu lists connected connectors with toggles and Manage in Settings | Add Browse connectors and Add custom connector rows to the Connectors submenu                                                                                                                                            | P2       |
| Slash menu                                                                                          | Own skills first, then plugin groups, names only                                                                                                                                           | Built-in commands (search, think, image, code) then every bundled skill with its full description                                                       | Group by plugin and show names with a one-line description clamp; keep built-ins first                                                                                                                                   | P2       |
| Model picker                                                                                        | Model list with one-line descriptions, Effort submenu, More models submenu                                                                                                                 | Model picker with Auto, effort popover                                                                                                                  | Already comparable; keep                                                                                                                                                                                                 | done     |
| General                                                                                             | Work descriptions list, Chat font, Motion, Voice language, style, speed; five notification switches                                                                                        | Work descriptions, response style traits, appearance, accent, motion, chat font, text size, read-aloud voice, custom commands                           | Add the voice Style and Speed selects only if a voice pipeline exists; otherwise done                                                                                                                                    | P3       |
| Account                                                                                             | Log out everywhere, Delete, Org ID, Trusted devices, Active sessions with actions                                                                                                          | Same plus API keys, linked devices, cancel deletion                                                                                                     | Done (ours is a superset)                                                                                                                                                                                                | done     |
| Privacy                                                                                             | Location metadata and Help improve switches; Export; Manage rows                                                                                                                           | Telemetry switch, Export, Manage rows, bulk archive and delete, temporary chats                                                                         | Done; do not add the two removed switches without a consumer                                                                                                                                                             | done     |
| Billing                                                                                             | Plan card, Payment, Invoices                                                                                                                                                               | Plan, status, portal, payment, top up, overage, credit history, invoices                                                                                | Done (superset)                                                                                                                                                                                                          | done     |
| Usage                                                                                               | Session, weekly, per model, usage credits block                                                                                                                                            | Four bars, refresh                                                                                                                                      | Add a per-model row when the server exposes it; the credits block lives in Billing                                                                                                                                       | P3       |
| Capabilities                                                                                        | Tool access mode, Connector search, model switch on flag, three visual switches, code execution, network egress, domain allowlist                                                          | One code execution switch, tool approval defaults, lockdown                                                                                             | Add Connector search (directory suggestion) and the artifact switches only when a consumer exists; network egress and allowlist need sandbox support                                                                     | P3       |
| Memory                                                                                              | Three switches, import, tables by group with Edit and Delete, a memory composer                                                                                                            | Persistent memory switch, generate, search, tool-assisted, exclusions, editor, import dialog                                                            | Add the grouped table view and the "tell me what to change" composer                                                                                                                                                     | P3       |
| Claude Code, Cowork, Chrome, Analytics, Keyboard, Cloud browser, Storage, Parental, Trusted contact | Present                                                                                                                                                                                    | Absent, or partially covered by Security (device code) and Help (shortcuts static)                                                                      | Keyboard shortcuts editor and Storage are candidates; the rest depend on products we do not ship on web                                                                                                                  | P4       |
| Sidebar chat menu                                                                                   | Claude: Open as quick task, Copy session ID, Pin, Mark as read, Rename, Add to project, Move to group, Archive, Delete; ChatGPT: Share, Rename, Pin chat, Archive, Delete, Move to project | `packages/ui/ui/src/sidebar/SessionItem.tsx`: Share, Rename, Pin or Unpin, Archive, Delete, Move to project                                             | Done; Mark as read and Copy session ID are Claude-only and not needed                                                                                                                                                    | done     |
| Sidebar recents filter                                                                              | Filter and group recents popover                                                                                                                                                           | Time-grouped list only                                                                                                                                  | Add Group by and Sort by                                                                                                                                                                                                 | P3       |

## 6. Build order

Each item names the files that own it today so an executor starts in the right place. Every visible change goes through the screenshot gate before commit.

### 6.1 Settings shell (P1)

1. Labelled nav groups: `packages/ui/ui/src/settings-nav.ts` (`SETTINGS_NAV_GROUPS_WEB`) already supports `group.label`; split into Settings and Customize and move memory next to skills, connectors, plugins.
2. Hash for every pane and detail: extend `apps/web/features/directory/routing.ts` so `settingsHashForSection` covers every section key (slug per key) and `parseSettingsDirectoryHash` accepts them; `SettingsModalProvider` opens any section from its hash; details keep the `browse/<id>` form.

### 6.2 Plugins manage view (P1)

1. Installed table (Plugin, Author, Skills count, Last updated) as the default Plugins pane, with Browse opening the directory view we have now and an Add menu. Owner: `apps/web/features/directory/hooks/useDirectoryAdapter.ts` (installed rows already come from `fetchPluginInstallState` plus `fetchPluginDirectoryEntry`), a new `PluginsInstalledTable` in `packages/ui/ui/src/directory/`.
2. Add menu: Add marketplace (exists), Upload plugin (needs `POST /api/plugins/upload` accepting a zip with `.claude-plugin/plugin.json`, stored like a marketplace install), Create a plugin (a form that writes a private marketplace entry), Create with Claude (opens the composer with a prompt, like claude.ai's Customize).
3. Detail tabs Skills and Connectors with the leader copy; the Connectors tab reads `requiredConnectors` and shows Connect per row.

### 6.3 Skills manage view (P1)

1. Installed table (Skill, Last updated, Author) with Browse and an Add menu; Upload skill (zip with SKILL.md, route `POST /api/skills/upload`), Create a skill (existing authoring flow behind `AGI_USER_SKILL_AUTHORING`), Create with Claude (composer prompt), Watch the intro video (docs link).
2. Detail: Enable skill switch (per user install), Try in chat (opens the composer with the skill selected), Remove.

### 6.4 Connectors manage view (P2)

1. All, Connected, Not connected filter chips above the list; Add menu with Browse connectors and Add custom connector.
2. Detail states: half-finished OAuth, never connected, "required by the following plugins" block from the plugin registry.
3. Composer Connectors submenu: add Browse connectors and Add custom connector rows.

### 6.5 Directory polish (P2, P3)

1. Install counts on plugin and skill cards where the registry has them; gear for installed, plus for not installed; Copy link on every detail.
2. Curated sources for Add marketplace (our first-party marketplaces) and a GitHub repository picker from the GitHub installation.
3. Connector directory facets Trending and New with counts.

### 6.6 Composer and sidebar (P2)

1. Slash menu grouped by plugin with clamped descriptions.
2. Sidebar chat menu parity (Pin, Archive, Move to project, Share) and a recents filter popover.

Everything in P3 and P4 waits until the product behind it exists on web; a switch with no consumer is dead UI and is not built.
