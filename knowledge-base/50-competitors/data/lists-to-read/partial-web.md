---
id: "DOC-50-competitors-data-lists-to-read-partial-web"
type: "comparison-data"
title: "partial web"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
## Web (350)

**Account and sign-in** (16)
- WP1 Authorization tokens and connected apps with revoke ★: No scope table
- WP2 Join a workspace by email invite, invite link or admin add ★: There is no shareable team invite link
- WP3 One person per account or seat; using it on several devices is fine ★: Do not state a one-person rule or a named-seat rule for teams
- WP4 Sign in with Apple ★: Shown only when AGI_AUTH_PROVIDERS lists it
- WP5 Work description picklist ★: Personalization has What best describes your work with 14 options (leaders offer about 20)
- WP6 Account menu: Claude Academy and Learn more links (Claude): No academy or course link
- WP7 Account menu: Language (Claude): No Language item in the account menu
- WP8 Account suspension appeal and data export (Claude): Data export is not shown as reachable for suspended accounts
- WP9 Emailed code when signing in from a new device or unusual place (ChatGPT): No extra code step for a new device or location was found in our code
- WP10 Import your setup from other tools (ChatGPT): Not projects or recent chats
- WP11 Same-email accounts merge; sign-in methods listed and linkable (ChatGPT): Automatic merge on a matching email was not verified
- WP12 Sign in with a passkey on the login screen (ChatGPT): Production setting not visible
- WP13 Sign in with Microsoft (ChatGPT): Shown only when AGI_AUTH_PROVIDERS lists it
- WP14 Temporary lockout after repeated failed sign-in codes (ChatGPT): Ordinary sign-in lockout is left to the identity provider and is not set anywhere in the repository
- WP15 Trusted devices that may remote-control your machine (Claude): Has no step-up requirement for remote control
- WP16 Web session length and renewal (Claude): Sessions last up to 7 days with a user-set idle timeout; owner chose to stay on the 7 day limit

**Plans, billing and usage** (19)
- WP17 Add a tax or VAT ID and a different invoice name ★: Sales are paused and no separate invoice name is built
- WP18 Code review billed on usage with a separate monthly cap ★: No separate Code Review spend cap or per-repo cost view
- WP19 Credit expiry rules ★: Purchased credits show 'No expiry date recorded' when none is set
- WP20 Developer console usage, cost and billing pages ★: No cost-by-model charts or CSV
- WP21 Local payment methods beyond cards (UPI, MoMo, ACH) ★: Checkout does not name payment methods in code
- WP22 Security scans billed by token usage with a spend limit ★: No separate scan spend limit found
- WP23 API rate-limit tiers that rise automatically (Claude): They do not rise with usage and no increase request exists
- WP24 Billing information edit (email, name, address) (ChatGPT): No editable form in the pane
- WP25 Chat resumes by itself when a usage limit resets (Claude): A stopped chat does not continue on its own
- WP26 Early access and research previews for paid users (ChatGPT): It is not tied to a plan and has no in-app preview toggle
- WP27 Long chats are summarized automatically; oversized message error (Claude): Is gated by a server switch, not a user-facing behavior
- WP28 Scheduled task limits by plan (ChatGPT): Free gets none (3 on Basic, 5 on Pro)
- WP29 Tax exemption request (ChatGPT): No self-service exemption request for personal or Team plans
- WP30 Usage alerts at chosen thresholds sent to chosen people (ChatGPT): No several thresholds or recipient list
- WP31 Usage credit alerts by notification (Claude): No separate credit alert notification found
- WP32 Usage page: per-model weekly limits (Claude): No row per model
- WP33 Usage page: refresh button and last updated (Claude): No last-updated stamp
- WP34 Usage pills in the sidebar (5-hour, weekly, credits) (ChatGPT): It is one bar, not separate 5-hour, weekly and credit p
- WP35 Wallet balance and transaction history (ChatGPT): Ours is a history of usage credits only (BillingSection.tsx:1246-1337)

**Home and navigation** (13)
- WP36 Account menu contents ★: No Language row, Academy or API keys
- WP37 Chat row menu: Delete with a confirmation naming the chat ★: It says it cannot be undone and library media stays
- WP38 Project, Files and Plugins chip row under the composer, plus Open desktop app link ★: There is no Open desktop app link under the composer
- WP39 Sidebar: Plugins / Customize destination ★: No sidebar entry
- WP40 Chat title menu in the header (Claude): No Pin and no single-key shortcuts
- WP41 Chats and tasks list with filter facets (Type, Status, Last activity, Group by, Sort by) (Claude): There are no status, date, group or sort facets
- WP42 Chatting without an account (ChatGPT): Guest chat opens on /chat only when the guest.chat flag and bot check allow it: 20 messages a day per device, an age st…
- WP43 Library views: Suggested, Recents, Favorites, Shared with you, Pages (ChatGPT): No Favorites, Recents, Suggested or Shared with you views
- WP44 Shortcuts: pin, rename, archive, mark unread: No keys for these
- WP45 Side panel for changes and activity can be shown or hidden (Claude): Plain web has no such toggle
- WP46 Sidebar: Finances destination (ChatGPT): Has no sidebar entry
- WP47 Sidebar: Images destination (ChatGPT): /chat/images only redirects to the Library Images tab
- WP48 Title menu: Schedule, Turn into skill, Copy session ID (Claude): There is no Copy session ID

**Composer and input** (8)
- WP49 Dictation fills the box as you speak (Live Dictation) ★: Text does not appear while speaking
- WP50 Plus menu: add connector (browse, custom) ★: Only 13 listed connectors are released
- WP51 Plus menu: Web search toggle ★: No search toggle
- WP52 @ mentions: ChatGPT documents @ on desktop only
- WP53 Floating toolbar on selected text with Ask for change, Comment and formatting (ChatGPT): Selecting text in an artifact shows Edit with AI, Improve and Comment actions; formatting sits in a separate fixed tool…
- WP54 Plus menu: add to project (Claude): Chats pick a project from a project picker in the composer rather than a plus menu row
- WP55 Prompt examples on a new chat (ChatGPT): A new chat shows a greeting and connector suggestions; ready-made prompts live in the template gallery, which opens cha…
- WP56 Turn on Study with @study, the + menu or a direct link (ChatGPT): There is no @study token or in-chat toggle

**Conversations and message actions** (7)
- WP57 Automatic context management for long chats ★: The chat shows no context-full notice or summary-and-continue prompt
- WP58 Switch models when a message is flagged (setting and label) ★: There is no setting to turn switching on or off
- WP59 Highlight reply text to share or start writing (ChatGPT): Selecting chat reply text offers no start-writing or share action
- WP60 Prompt to be notified when a reply finishes (Claude): No banner offers it while streaming
- WP61 Regenerate an answer with web search (ChatGPT): Search can only be forced on a new message with /search
- WP62 Share a single response (ChatGPT): HandleShare passes the answer's plain text to navigator.share, or copies it to the clipboard when the browser has no sh…
- WP63 Turn Lockdown Mode off for a single chat (ChatGPT): The composer has no label to turn it off for one chat

**Rendering and content** (9)
- WP64 Ask for a visual with @Visualize or let the model choose ★: There is no tag to force one
- WP65 Code block live preview (HTML, React, SVG, Mermaid, Vega) ★: No Vega found
- WP66 Inline interactive visuals written by the model ★: Free-form model HTML opens in the artifact panel, not inline
- WP67 More chart types and a static or interactive switch ★: Charts cover bar, line, pie (donut) and scatter, with no area, histogram, box, radar or others and no static switch
- WP68 Third-party app UI inline in an answer ★: An app card renders inline, but few apps exist because connectors are Coming soon
- WP69 Blocked output notice for copyright policy (Claude): Text has no copyright-specific block
- WP70 Interactive tables with sort and filter (ChatGPT): Sorting exists only in the spreadsheet artifact
- WP71 Send a writing block as a Gmail or Outlook draft (ChatGPT): Email blocks open the mail app by link or copy the text; draft cards need a connector, which is mostly Coming soon
- WP72 Writing block full-screen editor with undo and redo, outline, save to Library and download (ChatGPT): There is no undo or redo of AI edits, no contents list and no save to Library

**Models and reasoning** (5)
- WP73 Model lineup by plan ★: The Free plan has no manual model choice (Auto and free-quota models)
- WP74 Disabled model options explain why (ChatGPT): Does not explain capacity or role blocks
- WP75 Replies mixing text, visuals and interactive elements (ChatGPT): The model does not compose visuals as a general reply format
- WP76 Setting that lets a fast model switch itself to thinking for hard questions (ChatGPT): A chat on a fixed model has no switch that lets it escalate to thinking
- WP77 Upfront plan you can steer before or during an answer (ChatGPT): Ordinary thinking replies have none

**Search and research** (4)
- WP78 Company knowledge and enterprise search across connected tools ★: There is no single company-knowledge option or ready-made cross-tool search project
- WP79 Admin switch for web search and deep research (ChatGPT): There is no workspace switch for web search itself
- WP80 Research uses connected apps (Claude): Research can include connectors, but connectors are mostly Coming soon
- WP81 Unified search across chats, projects, files with type filters (ChatGPT): Filters are only by speaker, dates and archived, not by content type

**Files, media and creation** (9)
- WP82 Add Google Drive files to a chat from the + menu ★: The chat composer has no add-from-Drive option
- WP83 Create Word, PowerPoint, Excel and PDF files ★: There is no PDF output
- WP84 Largest single file in chat ★: Paid plans take 500 MiB; Free and Basic take 25 MiB
- WP85 Create, present and export slide decks (ChatGPT): No PowerPoint or Google Slides export was found
- WP86 Image editor: undo and redo selections and regenerate in another aspect ratio (ChatGPT): The editor has no undo or redo
- WP87 Image generation (ChatGPT): Paid plans generate images; Free uses a limited free-media model where offered
- WP88 Import and export formats for designs (DOCX, PPTX, XLSX, HTML) (Claude): DOCX and XLSX import and PPTX or HTML export were not found
- WP89 Interactive table view for uploaded data (ChatGPT): Row and column selection to ask about was not found
- WP90 Saved @name image references (ChatGPT): They are not saved by name

**Artifacts and documents** (23)
- WP91 Artifacts as their own destination in the sidebar ★: No Artifacts item in the sidebar: /chat/artifacts redirects to the Artifacts tab of Library
- WP92 Interactive visuals inside an answer, saved as an artifact or downloaded ★: None has a save-as-artifact or copy-as-image action
- WP93 Spreadsheet and data artifacts with working formulas (Data, Sheets) ★: Are read-only
- WP94 Table cell actions: merge cells, sort a column, table width ★: The toolbar offers no merge, sort or width controls
- WP95 Admin controls for Sites: use, publish publicly, invite outside visitors (ChatGPT): There is no separate switch for building sites or for outside visitors
- WP96 Artifact storage that apps keep between visits (Claude): Published apps get personal and shared key-value storage capped at 20 MB per scope and 4 MB per value
- WP97 Artifacts that refresh from connected apps (live data) (ChatGPT): A Live artifacts page refreshes artifacts on open or on demand; it needs connectors, which are mostly coming soon
- WP98 Bring data into a sheet from CSV, Excel, Google Sheets or paste; export xlsx or CSV (Claude): No import into an editable sheet and no .xlsx export
- WP99 Capabilities switches for Artifacts, Inline visualizations and code execution (Claude): There is no AI-powered artifacts switch
- WP100 Charts built from connected app data inside a document (Claude): A rich document has no chart blocks
- WP101 Comment @Claude in a document to get an edit (Claude): The comment itself is not a mention that triggers an edit
- WP102 Data dashboards from a data warehouse with each chart's query shown (Claude): Charts do not show their query or last refresh
- WP103 Design colour picker warns when text contrast is poor (Claude): Designs have no colour picker
- WP104 Design export to zip, PDF, PowerPoint or standalone HTML, with handoff to code (Claude): No zip, PowerPoint or handoff to a coding session
- WP105 Designs: edit an HTML design with AI on the selected part, brief dialog, replace images (Claude): There is no Design destination or free on-canvas drag editing
- WP106 Export a deck to PowerPoint, PDF or Google Slides (ChatGPT): A .pptx comes only when the assistant creates a file
- WP107 Import a design system or brand kit for designs and decks (Claude): There is no import of an existing design system
- WP108 Pages with comments (ChatGPT): Only the owner can comment, not viewers
- WP109 Run Python from a code block (ChatGPT): Ordinary code blocks have no Run button
- WP110 Sites: a relational database and file storage per site (ChatGPT): There is no relational database and no file storage for visitor uploads
- WP111 Sites: remix a coworker's published site (ChatGPT): Not Missing: a site's link is /shared-artifact/{token} (apps/web/lib/services/published-artifact-service.ts:294
- WP112 Sites: save a version without deploying, then restore (ChatGPT): There is no save-then-deploy step
- WP113 Turn an existing chat or notes into a page (ChatGPT): Not a whole chat or notes with files and links

**Accessibility and languages** (5)
- WP114 Interface languages ★: Two languages (English, Spanish) can be selected
- WP115 Artifact panel keyboard navigation (Tab in, Escape out) (Claude): No documented Tab-in order or F6 area jumping
- WP116 Chart accessibility: data table and text summary (ChatGPT): No follow-up prompt flow for keyboard controls or no-motion
- WP117 Right-to-left layout: Not selectable
- WP118 Voice mode in many languages (Claude): Voice has a language picker, but it offers 17 languages

**Agents, tasks and automation** (21)
- WP119 Active scheduled task limit by plan ★: Limits are Free 0 (paid only), Basic 3, Pro 5, Max 15, Max 15x 25, Team 10
- WP120 Agent work inside chat (Chat and Work modes) ★: Only Pro and higher plans get it
- WP121 Automations that react to events in any connected app (plugin events) ★: Triggers fire only for GitHub, Slack, Gmail, Google Calendar and webhooks, not for events from any connected app
- WP122 Cloud code environments: network level, variables, secrets, setup ★: No saved environments, variables or secrets
- WP123 Event triggers for a task (GitHub, Slack, Gmail, webhook) ★: Tasks can fire on GitHub, Slack and webhook events; Gmail and Google Calendar triggers are off while connectors are com…
- WP124 Send a task to your own computer and follow it from the browser (Dispatch, Remote) ★: Desktop is not yet released
- WP125 Tag the assistant in Slack channels to delegate work ★: No scheduled channel jobs or monitors
- WP126 Admin switches for Work in the cloud versus on the desktop (ChatGPT): Cloud and local work cannot be allowed separately
- WP127 Agent splits work among parallel background agents (ChatGPT): Web chat does not split work for you
- WP128 Agents page with Recently used, Built by me and a team directory (ChatGPT): The Agents page lists your agents and agents shared with you, with no recently used list or workspace-wide directory
- WP129 Builder limits which actions an agent may take in each connected app (ChatGPT): Not which actions in each app
- WP130 Computer use started from the web (Claude): The device tools run only with the Desktop app, which is not yet released
- WP131 Delete an agent task (Claude): Not deleted from the list
- WP132 Global and per-folder instructions for agent tasks (Claude): Web has no per-folder instructions
- WP133 Owner standing rules that add approval steps (ChatGPT): No free-text standing approval rules
- WP134 Pick model, effort, repositories and environment for each scheduled run (Claude): Has no reasoning effort, repository or sandbox environment choice
- WP135 Restaurant reservation search with booking partners (ChatGPT): Cannot look up booking times or reserve
- WP136 Scheduled inbox: unread indicator for runs needing attention (ChatGPT): No unread marker on the Schedules entry
- WP137 Several tasks at once, and starting tasks from a phone (Claude): Concurrent chat turns are capped by plan: 1 on Free, 3 on Pro, 5 on Max, 10 on Max 15x
- WP138 Slack per-channel reply mode and allowed tools (ChatGPT): There is no reply-to-all mode
- WP139 Start an agent from an API call with an access token (ChatGPT): An outside system can start an agent run: a trigger must belong to a scheduled task (apps/web/lib/triggers/trigger-serv…

**Browser actions** (4)
- WP140 Agent works in a browser pane beside the chat while you watch ★: On the plain web the agent cannot open a page you can watch
- WP141 Take control of the browser or computer, then hand back ★: Only in the Desktop app and for your own computer, not on the web
- WP142 Ask before consequential website actions, even on allowed sites (ChatGPT): No extra check for payment or commitment actions
- WP143 Clear the agent browser's cookies and saved sessions in settings (ChatGPT): The web app has no browser data settings

**Coding agent** (18)
- WP144 Auto-fix pull requests when CI fails or reviewers comment ★: It does not run by itself
- WP145 Code review commands (/review, /security-review) ★: No multi-agent deep review
- WP146 Code settings pane (PR options, themes, transcript size, tokens, delete sessions) ★: No settings pane for branch prefix, auto-PR, code themes or tokens
- WP147 Findings list with severity, status, filters and automatic fixed or reopened tracking ★: There is no cross-scan table, CWE, owner filters or auto-marking fixed or reopened
- WP148 Move a session between cloud, terminal and editor (teleport, Open in Cloud) ★: The CLI and VS Code are not yet released
- WP149 Plan mode and step limit per turn ★: No accept-edits or auto level
- WP150 Preinstalled toolchains, services and pinned runtime versions in the cloud image ★: No databases, Docker services or version pinning
- WP151 Review a pull request by commenting a mention (once, always, stop) ★: There is no always-review subscription or stop command, and drafts are skipped
- WP152 Sandbox size (vCPU, memory, disk) ★: Sizes come from the sandbox provider template, with no fixed figure
- WP153 Security review of each pull request with a severity threshold ★: There is no severity threshold or security-only manual trigger
- WP154 Cloud routines on a schedule, API call or GitHub event (Claude): No API-call trigger found
- WP155 Cloud session permission modes (Manual, Accept edits, Auto classifier, Plan) (Claude): There is no classifier-based Auto mode
- WP156 Fix many findings in bulk and verify patches with a patch checker (ChatGPT): There is no bulk fix or patch checker
- WP157 Pull request review triggers and depth levels (Claude): No per-repository choice or Quick, Standard, Deep levels
- WP158 Review finding severity labels and the reason each was flagged (Claude): There is no pre-existing category or collapsed reason
- WP159 Setting for internet access and code execution from chat and shell commands (ChatGPT): There is no separate public-internet switch or workspace default
- WP160 Slash commands in cloud sessions that take arguments (Claude): Model and step limit are set from menus, with no /model, /effort or /rename commands
- WP161 What a cloud session carries over from the repository (instructions, skills, agents, rules, MCP config) (Claude): Not repository skills, agents, rules, hooks or MCP configuration

**Connectors, apps, plugins and skills** (37)
- WP162 Account-wide default for tool approvals (ask, read-only, low-risk) ★: Tool approvals default is Ask before every action, Run read-only actions without asking, or Skip approvals
- WP163 Admin-held shared connections members use without signing in ★: There is no per-role choice between individual and managed sign-in
- WP164 Connect GitHub from chat ★: As a chat connector it is not in the released list
- WP165 Connectors directory: browse, search, categories, tool list and trust notice ★: A directory from the MCP registry and first-party list browses with categories, tools and a trust notice, but Connect i…
- WP166 Health: records and health chats kept apart ★: Connecting records is blocked because that connector is not released
- WP167 Interactive connector apps inside a chat (MCP Apps UI) ★: No fullscreen or picture-in-picture mode
- WP168 Public plugin catalog page with curated rows and example prompts ★: It has no curated rows and no Try in chat button
- WP169 Skills with bundled reference files and scripts ★: No path that runs a bundled script was found
- WP170 Add a plugin marketplace (curated sources or a GitHub repository) (Claude): There is no GitHub account picker
- WP171 Admin switch to stop members creating their own skills (Claude): Not just creation
- WP172 Admin switches for who may use, upload, share and publish plugins and skills (ChatGPT): No separate upload, share or publish rights
- WP173 Allow all actions for one plugin (elevated risk) (ChatGPT): There is no one-click allow-all per connector
- WP174 Connector tool permissions per role with conflict warnings (Claude): Roles and groups carry no connector rules
- WP175 Connectors, plugins and skills inside project chats (Claude): Projects have no plugin setting
- WP176 Custom GPTs: build, share and publish an assistant (ChatGPT): No public store
- WP177 Data analysis plugin with dashboards (ChatGPT): No warehouse access, so dashboards run on uploaded files only
- WP178 Deep research reads your connected apps (ChatGPT): Only 13 connectors are released (airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notio…
- WP179 Developer portal: submit a plugin, track review, see usage (Claude): There are no usage analytics for the author
- WP180 Directory status messages (plan, admin approval, workspace setup, desktop only, disabled) (ChatGPT): The directory shows no per-app labels for plan, admin approval or disabled
- WP181 Download a custom skill or delete it with confirmation (Claude): There is no one-click download of the whole skill package
- WP182 Education plugins for students and teachers (ChatGPT): No educator plugins for course design, lessons or rubrics
- WP183 Hand coding tasks to the agent from Slack (Claude): No repository or pull request flow
- WP184 Interactive connector display modes (inline, side panel, full screen) (Claude): No side panel or full-screen mode is offered
- WP185 Label plugins that cannot run on the web (ChatGPT): Plugin state names where a pack installs (Desktop and CLI versus website) and the web page refuses what cannot install…
- WP186 Legal plugins (document management, case research, community skills) (ChatGPT): No document-management or case-research connectors
- WP187 Microsoft Teams actions (send messages, create chats and channels, Planner tasks) (ChatGPT): Nothing sends a message or creates a chat
- WP188 More than one account per connector (ChatGPT): The connector page shows one connected account and no add-another button
- WP189 Plugin discovery ranked by continued use (ChatGPT): Retention does not affect ranking
- WP190 Plugins private by default, shared with people or the workspace (ChatGPT): Only an admin shares skills or plugins with the whole workspace
- WP191 Salesforce connector where each CRM change is proposed for review (Claude): Salesforce is an OAuth connector using the shared approval card for writes, not a bundled plugin
- WP192 Security scan of uploaded skills and plugins (Claude): No pass, warn or fail scan of uploaded skills was found
- WP193 Share a skill with teammates (Claude): A regular member cannot
- WP194 Skill list split into Personal, Shared with you and Organization (Claude): The skill list has no Personal, Shared and Organization sections
- WP195 Submit a plugin to the vendor directory and directory safety policy (Claude): No published listing policy page was found
- WP196 Subscribe a conversation or task to app updates (events) (ChatGPT): A chat cannot subscribe, and Gmail and Calendar triggers are coming soon
- WP197 Surface relevant connectors during a conversation (connector search) (Claude): There is no in-conversation directory search switch
- WP198 Workspace agents with apps, custom MCP tools and skills (ChatGPT): The choice between each runner's account and a shared agent account was not found

**Cross-device continuity** (4)
- WP199 Pair a phone or browser with a desktop computer ★: Desktop is not yet released and Remote Control is hidden in mobile v1 by decision
- WP200 Fork a coding session from the browser (Claude): No fork was found for cloud coding sessions
- WP201 Move conversations to another personal account (ChatGPT): Chats cannot be imported into another account
- WP202 Teleport a cloud session into the terminal (Claude): No one-step pull of a cloud session was found

**Help, feedback and support** (4)
- WP203 Help when you cannot sign in (deletion, export, cancel a plan) ★: Cancelling a plan without account access is not described
- WP204 Prompt library and educator starter prompts ★: No browsable prompt library page exists
- WP205 Coordinated vulnerability reporting and security.txt (Claude): No jailbreak bounty was found
- WP206 Crisis helpline shown in one click when distress is detected (ChatGPT): No helpline card appears in chat

**Memory and personalization** (7)
- WP207 Global instructions for every chat ★: Instructions for AGI is one box of 2,000 characters on every plan with an on/off switch
- WP208 Memory on by default, built from your chats ★: Memory is an opt-in switch that starts off; once on, facts are saved from chats and grouped by category
- WP209 Base style presets for tone (ChatGPT): Response style offers Default, Concise, Explanatory, Learning and Formal, plus length, technical level, formatting and…
- WP210 Custom instructions length differs by plan (ChatGPT): Instructions take 2,000 characters on every plan, and About you takes 1,500
- WP211 Memory summary you edit by text or highlight, with Delete and turn off (ChatGPT): The summary card is read-only with a refresh
- WP212 Suggested prompts and follow-up suggestions switch (ChatGPT): There is no Fast answers switch
- WP213 Tell the assistant what to change or remove in memory (Claude): The Memory pane has no such composer

**Notifications** (3)
- WP214 Coding session notifications and permission requests ★: Agent run updates for completions, failures and approval requests in this browser
- WP215 Per-category channel picker (Push, Email) (ChatGPT): Four event categories and agent runs, each with a channel select; far fewer categories
- WP216 Signed webhooks with test event and pausing (ChatGPT): No secret rotation or scan events

**Privacy, security and data** (26)
- WP217 Audit log stream and compliance export for admins ★: No content-level compliance API for chats and files found
- WP218 Cloud session network access levels ★: Users cannot add their own domains to the trusted list
- WP219 Content provenance marks on generated media (C2PA) ★: No public verify page found
- WP220 Crisis support banner with helplines ★: No dedicated in-chat banner
- WP221 Customer-managed encryption key ★: OrganizationKeyRing is called only from lib/services/audit-streaming-service.ts:156,165)
- WP222 Customer-managed encryption keys (CMEK, EKM) ★: OrganizationKeyRing is called only from lib/services/audit-streaming-service.ts:156,165)
- WP223 Data residency choice ★: Workspaces choose United States or European Union storage; personal accounts run in the US
- WP224 Member export permission toggle ★: No member-export toggle
- WP225 Member self-export of own data (admin switch) ★: No workspace switch found to allow or block member export
- WP226 Privacy Center hub ★: There is no separate hub page in the Help menu
- WP227 Provenance marks on generated content ★: No C2PA, watermark or text mark, as our own policy page says
- WP228 Retention of deleted chats and flagged content ★: The purge schedule is not stated in the pane
- WP229 Safety filters, ended conversations and suspension ★: We have no in-chat warning, conversation end or timed suspension flow
- WP230 Security certifications and trust center ★: Certifications not verified here
- WP231 Zero data retention option ★: Individuals have no such switch
- WP232 Automated moderation: block, warn, suspend (ChatGPT): No user-visible strike or temporary suspension flow found
- WP233 Cloud code sessions keep credentials outside the sandbox behind a proxy (Claude): Whether the GitHub token is kept out of the sandbox, and any block on branch deletes or tag pushes, was not established…
- WP234 Customer-visible record of vendor staff access to workspace data (Claude): Nothing in the workspace console shows it to the customer
- WP235 Data classes never saved to memory (Claude): There is no fixed system list of sensitive classes
- WP236 EU AI Act: prohibited uses and marking of AI output (ChatGPT): There are no training-data summaries (we train no models) and no EU reporting form
- WP237 Health space with separate data and disconnect (ChatGPT): Record connectors are not yet connectable
- WP238 Organization-wide data export by the owner (Claude): There is an owner route to members' content: place a legal hold, then Export records returns held messages, projects, f…
- WP239 Project permissions for create, manage and share (ChatGPT): No separate create or manage project toggles
- WP240 Sensitive conversations get extra care or routing (ChatGPT): No chat is routed to a different model
- WP241 Suspicious activity alerts (ChatGPT): There is no in-product alert banner
- WP242 US state privacy law disclosures (ChatGPT): No state-by-state consumer disclosure list was found

**Projects and organization** (9)
- WP243 Add sources to a project from Drive, GitHub or apps ★: Google Drive shows Coming soon and there is no GitHub import
- WP244 Project files, limits and search over large knowledge ★: Project sources are indexed with a status line; the limit is plan storage (500 MB Free to 100 GB) rather than a file co…
- WP245 Project instructions apply with account instructions ★: We do not document or test that project wins
- WP246 Remove a chat from a project, and drag a chat onto a project ★: Lists projects only: there is no remove-from-project entry and no drag
- WP247 Filter and group the chat list (Type, Status, Last activity, Group by, Sort by) (Claude): No Group by or Sort by
- WP248 Projects page tabs: yours, organization, shared with you (Claude): A shared project is labelled Shared with you only on its own page
- WP249 Share a project with teammates (ChatGPT): A member cannot start a chat in a project shared with them: creating a conversation in a project requires user_id to be…
- WP250 Sort a project's sources (ChatGPT): The sources panel sorts by newest or oldest and filters by type, with no alphabetical sort
- WP251 Start a new project from a chat (ChatGPT): There is no action that turns the open chat into a project

**Settings** (10)
- WP252 Display language ★: There is no auto-detect option
- WP253 Voice: language, style and speed selects ★: No style, model or intelligence choice
- WP254 Analytics tab (usage history, tool activity, code review) (ChatGPT): No tool activity or code review stats
- WP255 Base style and tone (ChatGPT): No quirky or friendly presets
- WP256 Cloud session permission dropdown (Accept edits, Plan, Auto) (Claude): Cloud code sessions do have a per-session mode menu: ApprovalModeControl in apps/web/features/code/components/CodeCompo…
- WP257 Code appearance: code theme and wrap long lines (Claude): No code font or separate light and dark themes
- WP258 Contrast setting (ChatGPT): Contrast has two levels (System, High), not three
- WP259 Higher intelligence switch (ChatGPT): There is no separate toggle
- WP260 Memory tables grouped You, Topics, Areas with edit and delete (Claude): No You, Topics, Areas grouping or tell-me-what-to-change composer
- WP261 Storage page with space used (ChatGPT): There is no separate Storage settings page, so Parti

**Sharing and collaboration** (9)
- WP262 Share a chat as a public snapshot link ★: Leader links have no expiry and last until unshared (catalog oh08:68, ch05:60)
- WP263 Share a chat with everyone in your workspace ★: The audience can be switched to your workspace only
- WP264 Share a plugin or skill with people, groups or the workspace ★: No named-person sharing or link
- WP265 Share a project with teammates (view or edit) ★: A single account with no workspace cannot share
- WP266 Artifact roles: view, comment and edit (Claude): No commenter or editor role was found
- WP267 Comments on shared artifacts, with Send to Claude (Claude): Viewer comments with an assistant thread were not found
- WP268 Mention people, agents, files and chats in a message (ChatGPT): The composer @ picks library files, folders and connectors only
- WP269 Share a single reply (ChatGPT): It gives no link to one reply, so Partial
- WP270 Slides: shared editing, comments and request edits (ChatGPT): No shared live editing or mentions

**Teams and admin** (77)
- WP271 Admin API to manage members, invitations and groups with an admin key ★: Key-authenticated routes were found only for the audit trail and legal-hold exports
- WP272 Analytics and usage API with admin key ★: There is no engagement or per-user skill, connector and cost API
- WP273 Automated PR review and GitHub account controls for Code ★: No review frequency, linkable-account list or GHES
- WP274 Compliance API and analytics API for the workspace ★: No separate compliance API
- WP275 Compliance API and third-party DLP, SIEM, eDiscovery integrations ★: No Compliance API for conversations and files
- WP276 Compliance API for chat and file content ★: An API does return content for compliance: the legal-hold eDiscovery export streams held messages with their text, proj…
- WP277 Connector permission levels set by role ★: Admins cannot set a tool-level level per role
- WP278 Default model and effort ceiling per role ★: No per-model caps or efficient mode preset
- WP279 Egress and capability controls for cloud agent runs ★: No network setting for Work runs or passwords toggle
- WP280 IdP group to role and seat mapping ★: Groups do not map to seat tiers
- WP281 Import a plugin marketplace from a GitHub repo with daily sync ★: Not an admin-governed workspace import with daily sync
- WP282 Just-in-time provisioning at first SSO sign-in ★: Ours is on by default (db/neon/0204_sso_jit_provisioning.sql:16) and the on/off and default role can only be changed th…
- WP283 Maximum reasoning level per model and role ★: Not per model
- WP284 Network egress modes for code execution ★: No named egress modes
- WP285 Org spend limit with enforcement and alert ★: Per-user, per-group and seat-type limits and alerts do not
- WP286 Organization default model and default effort ★: Workspace default model and a maximum effort cap, no separate default effort
- WP287 Per-user spend visibility in admin member list (month to date) ★: Members page shows no spend column
- WP288 Plugin marketplace allow and block lists ★: No marketplace-level lists or GitHub sync
- WP289 Roles with per-feature capability toggles (code, research, plugins, browser, etc.) ★: Overrides only narrow
- WP290 Seat types, default seat type and seat changes ★: No default seat type, bulk change or reduction schedule exists
- WP291 Security scanning product with Full, Triage, View access ★: No admin enablement or Full, Triage and View sharing roles
- WP292 Share projects and Public projects toggles ★: No separate public-projects toggle
- WP293 Single sign-on removal and exemption for outside members ★: No per-member exemption for people outside verified domains
- WP294 Skill sharing and publishing permissions with admin Skills page ★: No separate share, upload or publish toggles and no admin Skills list
- WP295 Spend limits at organization, group or member level ★: No group or member caps
- WP296 Spend limits per user, seat tier or group, with pooled group budgets and alerts ★: No per-member, per-group or pooled budget
- WP297 Team chat app in Slack or Teams with admin pairing and channel limits ★: No Microsoft Teams app
- WP298 Usage analytics broken down by model, product, member and reasoning ★: No reasoning, speed, plugin or skill breakdowns
- WP299 Workspace adoption analytics: active users, seat use, top tools, CSV ★: No active-user trends or top connector, skill or project views
- WP300 Workspace cancellation, deactivation and reactivation ★: No kept-data deactivated state or reactivation
- WP301 Workspace name, logo and workspace-wide instructions ★: No logo and no workspace-wide instructions
- WP302 Zero data retention on request ★: Our own service still stores the chats, files and memory, so it is not the leaders' zero data retention, where the vend…
- WP303 Admin control of file and Library sharing by workspace or role (ChatGPT): There is no separate switch for Library files
- WP304 Admin control of Google actions and Drive content (ChatGPT): No Drive-specific scope switch
- WP305 Admin controls for app actions, approvals and role access (ChatGPT): Not per role
- WP306 Admin enablement of newly released models (off by default) (ChatGPT): No off-by-default flag for new releases
- WP307 Admin Model Test: why a member cannot see a model (ChatGPT): Not a per-member model lookup
- WP308 Admin permissions, inventory and pause for always-on agents (ChatGPT): No inventory, pause control or per-agent audit view
- WP309 Admin switch for members exporting their own data (Claude): Admins have no workspace switch to allow or block it and there are no import controls
- WP310 Admin switches for artifacts, Sheets, workflows and interactive tool calls (Claude): None for artifacts, sheets or interactive views
- WP311 Admin-set maximum session length (forced re-login) (Claude): It is one deployment setting, not an admin choice per workspace
- WP312 Agent security policy: requirements, defaults, overrides (ChatGPT): No requirements and defaults split or text editing
- WP313 Always allow tools apply in scheduled tasks and auto-approve (Claude): I could not confirm they also govern scheduled runs
- WP314 Analytics viewer role that sees usage but cannot administer (ChatGPT): No role is scoped to usage analytics alone
- WP315 API workspaces with separate keys, limits and spend (Claude): No separate API workspaces with per-workspace limits or developer roles
- WP316 Apps admin tabs with search, filters and bulk roles (ChatGPT): No Draft tab, filter or bulk role change
- WP317 Artifact events in audit and compliance feed (Claude): No artifact publish or delete feed and no list, read or delete API
- WP318 Artifact retention for private versus shared artifacts (Claude): One period for all, not separate for private and shared
- WP319 Automatic account creation for verified domains and join auto-approval (ChatGPT): Verified-domain sign-in without SSO does not add members and no auto-approve setting exists
- WP320 Capabilities start off until an admin enables them (Claude): Only Fast mode starts off
- WP321 Customer-managed encryption keys (Claude): OrganizationKeyRing is called only from lib/services/audit-streaming-service.ts:156,165)
- WP322 Data region and inference region shown to admins (ChatGPT): No inference region is shown
- WP323 Data residency region for the workspace (ChatGPT): The console panel only records a requested region (lib/se
- WP324 Execution policy profiles: shell, sandbox, per-environment (ChatGPT): No shell, sandbox mode or per-environment policy
- WP325 External sharing and single-artifact allow switches (Claude): No separate switches per link kind or per artifact
- WP326 GPT management view and GPT sharing controls (ChatGPT): No admin view of all members' agents
- WP327 Local and cloud Work permissions per role (ChatGPT): Work has no local versus cloud split
- WP328 Lockdown Mode role: block network features such as web search and agent mode (ChatGPT): There is no one-switch lockdown role
- WP329 Member sees their own usage and cost; admin toggle for cost visibility (Claude): No admin toggle controls cost visibility
- WP330 Members create access tokens for scripts (ChatGPT): No admin setting governs member tokens
- WP331 Per-repository and whole-organization review enablement (Claude): There is no per-repo or per-organization selection
- WP332 Plugin and skill inventory for the org (Claude): No usage counts or skill inventory
- WP333 Provision skills to the whole org or to groups (Claude): No standalone org skill upload
- WP334 Publishing policy for members: review, open or off, with a review queue (Claude): The workspace owner has no publishing policy
- WP335 Pull request review check run with states and severity table (Claude): No check run with status titles or a severity table
- WP336 Pull request review triggers: on open, every push, mention (Claude): Admins cannot pick once, every push or manual per repo
- WP337 Restricted-feature messages members see (Claude): No distinct disabled-by-org versus not-granted wording was found
- WP338 Review a member's direct roles and effective permissions (ChatGPT): No combined effective-permissions view on the member
- WP339 Review budget cap and notice when a review is skipped (Claude): A monthly cap of 100 reviews per installation is set by an environment value, not by an admin, and a skipped review is…
- WP340 Revoke a group's access to shared projects, skills and plugins (ChatGPT): No group-wide revoke
- WP341 Security posture review against recommended settings (Claude): No attestation or PDF report
- WP342 Sign a member out everywhere (Claude): There is no sign-out-and-keep-member action
- WP343 Skill and plugin security scanning with caution or block (Claude): There is no caution banner tier
- WP344 Slack access modes: workspace, org members, roles (Claude): No organization-wide access mode
- WP345 Teams within a workspace (ChatGPT): No separate teams list with owner and description
- WP346 Workspace agents admin: who builds, publishes and schedules agents (ChatGPT): No admin review page of agents
- WP347 Workspace starting defaults for model and reasoning (ChatGPT): No starting model default

**Voice** (3)
- WP348 Voice that creates documents, slides and spreadsheets (Voice in Work) ★: No voice-started Work task handoff
- WP349 Hands-free and push-to-talk choices (Claude): No push-to-talk
- WP350 Setting to run voice in its own separate screen instead of inside the chat (ChatGPT): There is no setting for a separate voice screen
