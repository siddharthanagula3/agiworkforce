# ChatGPT — Web Settings, macOS Desktop App, and Browser Extension (Screenshot Evidence)

**Source:** `/Users/siddhartha/Desktop/chatgpt_reference/` — files matching `chatgpt-web-*` and `chatgpt-macos-*` (37 files, numbered 088–091 and 122–154).

**CAVEATS (read before using this as ground truth):**

- These are **point-in-time captures of unknown exact date**. Filesystem `mtime` on all files is **Jul 21, 2026**, which is the capture/export date, not necessarily the date the product state was current. Treat every label, price, and toggle state below as "true as of a July 2026 capture," not as current fact.
- The billing screenshot shows an account named **Siddhartha Nagula**, plan **"ChatGPT Pro 20x"**, auto-renewing **Aug 13, 2026**, with a billing history line dated **Jul 13, 2026** for **$212.80**. This is the account used to take these captures — a real, paid Pro account, not a fresh/default account. Some toggle states (Ultra effort off, Location off, Reduce sensitive content off, Automatic recharge off, Authenticator app off, Lockdown mode off, Developer mode off) reflect this specific user's choices, not necessarily product defaults.
- The macOS app screenshots (088–091) show sidebar navigation items — **Sites, Scheduled, Hooks, Connections, Git, Environments, Worktrees, Computer use, Appshots** — and a permissions model (**Default permissions / Auto-review / Full access**) that goes well beyond a conventional consumer chat app. This looks like a build where ChatGPT desktop has converged with Codex/agentic-coding capability (subagents, compaction, worktrees, git are explicitly named in-product). This may be a beta, an internal/dogfood build, or a newer unified release — **flagging this explicitly as unusual and likely not representative of the mainstream consumer ChatGPT desktop app** that most users see. Do not treat "Hooks / Worktrees / Git" as guaranteed-shipped consumer surface without corroboration.
- The browser extension identifies itself as **"ChatGPT for Chrome" v1.2.27221.15725** — record this exact version string as evidence; do not assume it is the current version at time of audit.
- No iOS screenshots are in this assigned set. **iOS settings tree comparison: not covered by these captures.** Any iOS-vs-web comparison would have to come from a different evidence set.
- I did not see every plugin/connector in the Plugins list (the list scrolls; some rows are cut off between captures). Only what is visibly legible is transcribed.

---

## Part 1 — macOS Desktop App

### 1.1 — `088-chatgpt-macos-work-mode-empty-state-quick-actions.png`

**Screen:** Main window, **"Work" mode** selected (segmented control top-center: **Chat | Work**, Work active).

**Left sidebar** (top to bottom):

- "ChatGPT" wordmark + chevron (dropdown), search icon (top right of sidebar)
- New chat (pencil-in-square icon)
- Sites (grid icon)
- Scheduled (clock icon)
- Plugins (@ icon)
- **Pinned** section header
  - "ROLE You are a senior full-stack + Rus..." pinned item, showing keyboard shortcut badge **⌘1**
- **Projects** section header
  - agiworkforce (folder icon, blue dot indicator)
  - cli (folder icon) → "No chats" (greyed sub-line)
  - o1 (folder icon) → "No chats" (greyed sub-line)
- **Recents** section header, list of recent chat titles (AGI Workforce Feature Specs, OpenAI Build Week Info, Qwen API vs Mulerouter, Goal Statement Refinement, Claude App Documentation, AI Client Documentation, Documentation for LLM Apps, Voice AI App Research, Master AI Coding Prompt, AI Subscription Billing Economics, AI Platform Documentation [cut off])
- Bottom: user row — avatar "SN", "Siddhartha Nagula", help "?" icon

**Main pane:**

- Headline: **"What should we work on?"**
- Composer box, placeholder **"Work with ChatGPT"**
- Composer bottom row: **+** (attach), **"Full access"** label in orange with a warning-triangle icon, right side: **"5.6 Sol"** model badge + **"Light"** effort dropdown (chevron), mic icon, grey circular up-arrow send button
- Below composer, second row: **"Choose project"** (folder icon), a small icon cluster (doc/PDF/plugin icons) + **"Plugins"** label, and a laptop/monitor icon at the far right
- Three suggestion rows below (icon + label):
  - 💡 "Create a file or build a site"
  - 📖 "Research and plan next steps"
  - ⏱ "Automate routine and recurring work"
- Top right of window: two icons (a rectangle/"open in new" icon and a sidebar-panel toggle icon)

### 1.2 — `089-chatgpt-macos-chat-empty-state-ready-when-you-are.png`

**Screen:** Same window, **"Chat" mode** selected (segmented control: Chat active, Work inactive). Sidebar identical to 088.

**Main pane:**

- Headline: **"Ready when you are."**
- Composer, placeholder **"Message ChatGPT"**
- Composer row: **+** (attach), right side: **"Instant"** model label, mic icon, grey circular up-arrow send button
- No quick-action suggestions shown in Chat mode (contrast with Work mode's three suggestions)
- Top right: **three** icons visible here (an additional circular/target icon appears versus 088's two — likely a "focus mode" or capture-artifact toggle)

### 1.3 — `090-chatgpt-macos-model-picker-dropdown-intelligence-levels.png`

**Screen:** Same Chat empty state, with the **model/intelligence picker open** (triggered from the "Instant" label).

**Dropdown contents**, header **"Intelligence"**:

- Instant — **5.5** — ✓ (checkmark, currently selected)
- Medium
- High
- Extra High
- Pro
- — divider —
- **GPT-5.6 Sol** — chevron **›** (indicates a nested/secondary picker, i.e., a separate model family selector beyond the "Intelligence" tiers)

This confirms two orthogonal axes in the picker: **effort/intelligence tier** (Instant/Medium/High/Extra High/Pro) is one axis, and a distinct **model name** ("GPT-5.6 Sol") is reachable via the same menu as a submenu.

### 1.4 — `091-chatgpt-macos-settings-general-permissions-full-access-defaults.png`

**Screen:** Settings window, **General** page (Personal section).

**Full settings left rail** (grouped, with group labels):

- Back to app (top, back arrow)
- Search settings… (search field)
- **Personal**
  - General (selected)
  - Profile
  - Appearance
  - Voice
  - Configuration
  - Personalization
  - Pets
  - Keyboard shortcuts
  - Usage & billing
  - Account (external-link arrow icon — opens web account settings)
- **Integrations**
  - Appshots
  - Plugins
  - Browser
  - Computer use
- **Coding**
  - Hooks
  - Connections
  - Git
  - Environments
  - Worktrees
- **Archived**
  - Archived chats

**Main panel — "General":**

_Permissions_ section:

- **Default permissions** — toggle ON. "By default, ChatGPT can read and edit files in its workspace. It can ask for additional access when needed"
- **Auto-review** — toggle ON. "ChatGPT can read and edit files in its workspace. ChatGPT automatically reviews requests for additional access. Auto-review can make mistakes. **Learn more** about elevated risks."
- **Full access** — toggle ON. "When ChatGPT runs with full access, it can edit any file on your computer and run commands with network, without your approval. This significantly increases the risk of data loss, leaks, or unexpected behavior. **Learn more** about elevated risks."

_General_ section:

- **Default file open destination** — "Where files and folders open by default" — dropdown: **Default app**
- **Language** — "Language for the app UI" — dropdown: **Auto detect**
- **Show in menu bar** — "Keep ChatGPT in the macOS menu bar when the main window is closed" — toggle ON
- **Bottom panel** — "Show the bottom panel control in the app header" — toggle ON
- **Default terminal location** — "Choose where the terminal shortcut and environment actions open terminal tabs" — segmented control: **Bottom** (selected) / Right
- **Prevent sleep while running** — "Keep your computer awake while ChatGPT is running a task" — toggle ON
- **Speed** — "Choose how quickly ChatGPT runs across chats, subagents, and compaction" — dropdown: **Fast**

**Capability signal:** the phrase "across chats, subagents, and compaction" and the presence of Hooks/Git/Worktrees/Environments nav items indicate this app build has a coding-agent runtime with subagent orchestration and context compaction — concepts otherwise associated with CLI coding agents, not typical chat apps.

---

## Part 2 — Web Settings (`chatgpt.com`, in-browser modal)

All web settings screens are captured inside a **centered modal dialog** (not a full page), with a fixed-width **left icon+label rail** and a scrollable **right content pane**, an **X** close button top-left of the rail. The underlying page behind the dimmed overlay shows the ChatGPT web app shell: left app sidebar (New chat, Library, Projects, Scheduled, Plugins, "···" More, Recents list), a top **Chat | Work** segmented toggle, and a settings gear icon top-right. The browser chrome itself (visible in every capture) is a bookmarks-bar browser with tabs "AGI Workforce Feature Spec…" and "ChatGPT", a bookmark star/link icons, a camera icon, a puzzle-piece icon, a lines/menu icon, an audio-waveform icon, and an "Assistant" label in the toolbar, plus an "All Bookmarks" bar.

### 2.1 Full settings navigation tree (verbatim, reconstructed by paging through every screen)

```
Settings
├── General
├── Notifications
├── Personalization
├── Plugins
├── Voice
├── Billing
├── Usage
├── Data controls
├── Cloud browser
├── Storage
├── Safety
├── Security and login
├── Parental controls
├── Trusted contact
├── Account
└── Keyboard
```

This order is stable across every capture (122–148) and was confirmed by reading the left rail on each successive screen — it does not re-sort or group under headers the way the macOS app's rail does (no "Personal/Integrations/Coding" grouping on web; it is one flat list).

### 2.2 — `122-...-general-appearance-intelligence-dictation.png`

**General**

- Appearance — dropdown: **Dark**
- Contrast — dropdown: **System**
- Accent color — swatch (black) + dropdown: **Black**
- Language — dropdown: **Auto-detect**
- **Higher intelligence** — toggle ON. "ChatGPT can automatically use a higher intelligence setting when you ask a complex question."
- **Enable Ultra effort** — toggle OFF. "Ultra uses multiple agents in parallel for your most ambitious tasks. This will consume your usage limit significantly faster."
- **Enable Dictation** — toggle ON. "Use dictation in the chat composer."

### 2.3 — `123` / `124` — Notifications (top and bottom of scroll)

Each row: label, a **Push / Email / Push, Email** dropdown pill, and a description line.

- **Codex** — Push — "Get notified about Codex tasks."
- **Group chats** — Push — "You'll receive notifications for new messages from group chats."
- **Marketing** — Push, Email — "Stay in the loop on new tools and features from ChatGPT."
- **Personalized tips** — Push, Email — "Get helpful recommendations based on your conversations with ChatGPT."
- **Projects** — Email — "Get notified when you receive an email invitation to a shared project."
- **Responses** — Push — "Get notified when ChatGPT responds to requests that take time, like research or image generation."
- **Tasks** — Push — "Get notified when tasks you've created have updates." + **Manage tasks** link
- **Usage** — Push, Email — "We'll notify you when limits reset for features like image creation."

Note the **"Codex"** notification category sitting first, ahead of Group chats — Codex is treated as a first-class, always-present notification stream on the consumer settings surface, not hidden behind a developer toggle.

### 2.4 — `125` / `126` / `127` — Personalization (three scroll positions)

- **Base style and tone** — dropdown: **Default**. "Set the style and tone of how ChatGPT responds to you. This doesn't impact ChatGPT's capabilities."
- **Characteristics** — "Choose additional customizations on top of your base style and tone." Each is its own dropdown row, all **Default**:
  - Warm
  - Enthusiastic
  - Headers & Lists
  - Emoji
- **Fast answers** — toggle ON. "ChatGPT can sometimes use its general knowledge to give fast, in-depth answers. These aren't personalized and don't use your memory."
- **Suggested prompts** — toggle ON. "ChatGPT can generate suggestions based on searching connected plugins"
- **Custom instructions** — free-text box, placeholder "Additional behavior, style, and tone preferences"
- **Pet**
  - Default — "Choose a companion that works alongside you" — **Select pet ›** link
- **About you**
  - Nickname — text field, placeholder "What should ChatGPT call you?"
  - Occupation — text field, placeholder example "Engineering student at University of Waterloo"
  - More about you — text field, placeholder "Interests, values, or preferences to keep in mind"
- **Memory** (ⓘ info icon next to heading)
  - **Enable memory** — toggle ON. "Let ChatGPT personalize your experience based on your chats, files, and connected apps. Learn more"
  - **Memory summary** — "View an overview of what ChatGPT has learned about you. Use custom instructions for information you'd like it to always keep in mind. You can still manage your old saved memories." — **Manage** button
  - Disclosure line: "ChatGPT may use Memory to personalize queries to search providers, such as Bing. Learn more"
- **Record mode** (ⓘ info icon)
  - **Reference record history** — toggle ON. "Let ChatGPT reference all previous recording transcripts and notes when responding."
- **Advanced** — collapsed section, chevron (contents not captured — not covered by these captures)

"Pet" as a named companion concept, and "Record mode" (recording transcripts) as a personalization sub-feature, are both notable — these are not documented as headline ChatGPT features and would not be found by reading marketing pages.

### 2.5 — `128` / `129` / `130` — Plugins (three scroll positions)

Header: **"Plugins"** — "Manage plugins you've installed"

- **Permissions** — "Choose when ChatGPT should ask for permission when using plugins." → **Allow low-risk actions ›**
- List of installed plugins/connectors, each a row with icon, name, and (for some) a status pill, all with a **›** chevron to drill in:
  - Build iOS Apps
  - Build macOS Apps
  - Build MCP Apps
  - Build Web Apps
  - Codex Browser Recorder
  - Default templates
  - Documents
  - Expo
  - GitHub — status pill **"Allow all"**
  - Google Drive
  - OpenAI Developers
  - PDF
  - Presentations
  - Sales
  - Spreadsheets
  - Vercel
  - Browse plugins (entry point to a plugin directory/store)
  - **Developer mode** (separate row, own gear icon, leads to a distinct sub-panel — see below)

This is effectively ChatGPT's **app/connector catalog surface**: build targets (iOS/macOS/MCP/Web apps), document-type plugins (PDF, Spreadsheets, Presentations, Documents), and third-party OAuth connectors (GitHub, Google Drive, Vercel, Expo, "OpenAI Developers"). "Codex Browser Recorder" as a plugin is notable — it implies a companion capability where a browser session can be recorded to generate an automation/task for Codex.

**Developer mode** sub-panel is reached from Plugins but its content was actually captured as part of Security and login flow (see §2.10) — the same "Developer mode" concept is referenced from two places, once as a Plugins list row and once inside Security's "Advanced security" section, suggesting Developer mode is a cross-cutting account-level flag surfaced in more than one nav location.

### 2.6 — `131` — Voice

- Large circular gradient avatar (voice "face")
- Voice name: **Spruce** — subtitle **"Calm and affirming"**
- Carousel indicator: 9 dots, left/right chevron arrows (9 voice options total, "Spruce" is the 1st)
- **Model** — dropdown: **Live**
- **Intelligence** — dropdown: **Instant**
- **Language** — dropdown: **Auto-detect**

### 2.7 — `132` / `133` — Billing (two scroll positions)

- Plan: **"ChatGPT Pro 20x"** — "Your plan auto-renews on Aug 13, 2026" — **Compare plans** button
- **Billing history**
  - Jul 13, 2026 — $212.80 — status pill **Paid** (green) — **View** link
- **Billing information** — **Edit** button
  - Billing email: agiautomationllc@gmail.com
  - Name: Siddhartha Nagula
  - Address: 1020 West Abram Street, Apt 125, Arlington, TX, 76013, United States
- **Payment methods** — **Add new** button
  - Visa •••• 5751 — **Default** badge — ⋮ overflow menu
- **Cancel plan** — "If you cancel, you'll keep full access to your plan features until the end of your billing period." — **Cancel** button (red/destructive outline)

"ChatGPT Pro 20x" is a plan name/tier not documented in generic marketing copy at a glance — record verbatim, flag for verification against current OpenAI pricing docs before quoting externally (per repo's model/pricing verification rule), since this is one account's specific plan label at capture time.

### 2.8 — `134` — Usage

Header: **"Usage Limits"** — "Track usage within plan limits"

- **Usage** section: "Usage is shared across Codex, Work, Workspace Agents, and ChatGPT for Excel. It doesn't include Chat conversations."
  - **Weekly usage limit** — progress bar — **"100% remaining"**
- **Usage limit resets** — "No usage limit resets available at this time." (empty state)
- **Credits** (ⓘ info icon)
  - "0 credits" — **Buy credits** button
  - **Automatic recharge** — toggle OFF

This confirms a **shared usage pool across Codex, Work, Workspace Agents, and "ChatGPT for Excel"** distinct from ordinary chat — i.e., agentic/task-based consumption is metered separately from conversational usage, and there is a **pay-as-you-go credits system** with an optional auto-recharge toggle, layered on top of the subscription plan. "ChatGPT for Excel" as a named product surface is notable — not something evident from general docs.

### 2.9 — `135` / `136` — Data controls (two scroll positions)

- **Improve the model for everyone** — status **On ›** (drills into its own screen — not captured further)
- **Location** — "When enabled, your location helps ChatGPT provide more relevant information, like local recommendations, news, and weather. Learn more" — **Turn on** button (currently off)
- **Work network access** — status **On ›**
- **Reset ChatGPT Work** — **Reset** button (red outline)
- **Shared links** — **Manage** button
- **Archived chats** — **Manage** button
- **Archive all chats** — **Archive all** button
- **Delete all chats** — **Delete all** button (red outline)
- **Export data** — **Export** button
- **Marketing privacy** — chevron **›** (drills into its own screen — not captured further)

"Work network access" and "Reset ChatGPT Work" as first-class Data controls entries (as opposed to being under Cloud browser) show that "ChatGPT Work" is treated as having its own data/network footprint separate from ordinary chat, with its own reset action.

### 2.10 — `137` — Cloud browser

Header: **"Cloud browser"** (ⓘ info icon)

- **Default permissions** — dropdown: **Always ask**. "Choose if ChatGPT asks for approval before opening websites."
- **Site permissions** — "Add sites to override the default permission." — **Add site** button
- **Browser data**
  - **Cookies** — "Remove cookies saved by the cloud browser." — **Clear all** button (red outline)

This confirms ChatGPT runs an actual **cloud-hosted browser** with its own cookie jar and a **per-site permission override list**, distinct from the local "Computer use" capability seen in the macOS app's Integrations nav.

### 2.11 — `138` — Storage

- **"161 MB of 100 GB used"** — horizontal usage bar (near-empty)
- **Manage storage** — "Manage your library to free up storage"
  - **Files** — 141 MB • 154 files — chevron ›
  - **Images** — 19.9 MB • 48 images — chevron ›

### 2.12 — `139` — Safety

- **Reduce sensitive content** — toggle OFF. "Add extra safeguards around sensitive topics and limit certain types of content in ChatGPT. Learn more"

This is the entirety of the Safety page as captured — a single toggle, no other rows visible.

### 2.13 — `140` / `141` / `142` — Security and login (three scroll positions)

- **Password** — **Add ›**
- **Security keys & passkeys** — count **1 ›** — "Last added on July 21, 2026"
- **Multi-factor authentication (MFA)**
  - **Authenticator app** — "Use one-time codes from an authenticator app." — toggle OFF
  - **Text message** — "Get 6-digit verification codes by text." **+1 682-458-5291** (link) — toggle ON
- **Sessions**
  - **Active sessions** — count **2 ›** — "View all devices that have accessed your account. You can review active sessions, remove trusted devices, or use Log out all to end all sessions."
- **Advanced security**
  - **Advanced account security** — "Adds the highest level of account security by requiring stronger sign-in methods and applying stricter protections to help prevent unauthorized access." — **Enroll ›**
  - **Lockdown mode** — "Helps protect sensitive data from prompt-injection attacks by limiting features that can connect to the web or external services. Learn more" — toggle OFF
- **Developer mode**
  - **Developer mode** — badge **"ELEVATED RISK"** (orange) — "Allows you to add unverified connectors that could modify or erase data permanently. Use at your own risk. Learn more" — toggle OFF
  - **Enforce CSP in developer mode** — "When enabled, dev mode apps without a declared CSP get the same restricted default CSP they would in production instead of unrestricted network access. Learn more" — toggle OFF
- **Secure sign in with ChatGPT** — "Sign in to websites and apps across the internet with the trusted security of ChatGPT. Learn more"
  - **Codex CLI** — "Allow Codex CLI to use models from the API." — **Disconnect** button (red outline) → state = **already connected**
  - **Enable device code authorization for Codex** — "Use device code sign-in for headless or remote environments where the normal browser flow isn't available. Exercise caution in enabling, as device codes can be phished. Never share a device code." — toggle OFF

Two capability signals worth flagging explicitly:

1. **"Lockdown mode"** is framed specifically as anti-**prompt-injection** protection that "limit[s] features that can connect to the web or external services" — i.e., OpenAI names prompt injection directly in end-user-facing settings copy, not just in developer docs.
2. **Codex CLI is managed as an OAuth-like connected app inside ChatGPT's own account security page**, with a device-code authorization flow (classic OAuth device flow, explicitly warned against phishing) as an alternative to browser-based sign-in. This is the same page where passkeys, MFA, and session management live — Codex CLI auth is treated as account-security-grade, not a separate developer console.

### 2.14 — `143` — Parental controls

Header: **"Parental controls"** (ⓘ info icon top right)

- "Parents and teens can link accounts, giving parents tools to adjust certain features, set limits, and add safeguards that work for their family. Learn more"
- **+ Add family member** button

Empty state — no linked family members shown.

### 2.15 — `144` — Trusted contact

Header: **"Trusted contact"**

- "Having a trusted contact can make it easier to get support from someone who knows you well."
- "In the future, if you discuss suicide with ChatGPT in a way that indicates a serious safety concern, we may automatically notify your trusted contact so they can check in with you. They must be 18+ to participate. Learn more"
- **+ Add contact** button

Empty state — no contact configured. This is a distinct safety feature from Parental controls — an opt-in emergency-contact escalation path tied specifically to self-harm/suicide risk detection, described in plain end-user language.

### 2.16 — `145` / `146` — Account (two scroll positions)

- **Name**: Siddhartha Nagula
- **Username**: @agiautomationllc ›
- **Email**: agiautomationllc@gmail.com ›
- **Delete account** — **Delete** button (red outline)
- **GPT builder profile** — "Personalize your builder profile to connect with users of your GPTs. These settings apply to publicly shared GPTs."
  - Preview card: icon + **"PlaceholderGPT"** — "By Siddhartha Nagula" — **Preview** link (this is literally a placeholder name, evidence this is a default/unconfigured builder profile, not an actual published GPT)
  - **Name** — toggle ON — value "Siddhartha Nagula" (ⓘ info icon)
  - **Links**
    - 🌐 "Select a domain" (dropdown)
    - LinkedIn — **Add** button
    - GitHub — **Add** button
  - **Email**: agiautomationllc@gmail.com
    - checkbox (unchecked): **"Receive feedback emails"**

### 2.17 — `147` / `148` — Keyboard (two scroll positions)

Header: **"Keyboard"**

- "To change a shortcut, select the key combination, and then type the new keys."

**Composer** section (all rows: toggle + shortcut, all toggles ON):
| Action | Shortcut |
|---|---|
| Send message or stop answering | ↵ (Return/Enter) |
| Select model | ⌃⇧M |
| Toggle voice | ⌃⇧V |
| Toggle dictation | ⌃⇧D |
| Add photos & files | ⌘U |

**App** section (all rows: toggle + shortcut, all toggles ON):
| Action | Shortcut |
|---|---|
| Open new chat | ⇧⌘O |
| Show shortcuts | ⌘/ |
| Search | ⌘K |
| Toggle dev mode | ⌘. |
| Toggle sidebar | ⇧⌘S |
| Set custom instructions | ⇧⌘I |
| Copy last code block | ⇧⌘; |
| Delete chat | ⇧⌘⌫ |

Bottom-right of panel: **Restore defaults** button.

Every shortcut row is independently rebindable per the toggle switch next to it (toggle appears to enable/disable the shortcut rather than being purely cosmetic — "To change a shortcut, select the key combination, and then type the new keys" implies click-to-rebind UX, similar to macOS System Settings > Keyboard Shortcuts).

---

## Part 3 — Browser Extension ("ChatGPT for Chrome")

Captured as a **Chrome side panel** docked to the right edge of the browser window, overlaying a Google.com new-tab page, alongside two pinned bookmark folders labeled "Claude" and "Claude" in the bookmarks bar (unrelated to ChatGPT — just the browser's existing bookmark state). Panel header: ChatGPT logo, **"ChatGPT"** title, pin icon, **X** close icon.

### 3.1 — `149` — Empty state / new task

- Sub-header row: **"New task"** with a chevron (dropdown — see 150) and a **"···"** overflow icon (see 151/154)
- Empty body (no messages)
- Composer: placeholder **"Do anything"**
- Composer bottom row: **+** (add/attach), **"Full access"** label (orange, warning-triangle icon), right side: a split/compare-view icon, mic icon, grey circular up-arrow send button

The composer placeholder **"Do anything"** (vs. web's "Message ChatGPT" / macOS Work mode's "Work with ChatGPT") signals this extension panel is positioned as a general-purpose agentic action surface, not a chat box.

### 3.2 — `150` — Task history ("New task" dropdown open)

- Search field: **"Search recent tasks"**
- List, each row = task title (truncated) + relative age, right-aligned:
  - "hi" — 7h
  - "hi" — 7h
  - "AGI Workforce Cloud parity — Codex con…" — 3d
  - "ROLE You are a senior full-stack + Rust s…" — 4d
  - "can you create more parallel agents and …" — 4d
  - "Map repo architecture" — 5d
  - "Find current logo" — 1w
  - "Create investor presentation" — 1w
  - "You are acting as a Senior Staff Software …" — 3w

This is a **task switcher**, not a chat history list — titles read as agent task prompts/goals (e.g., "Map repo architecture," "Create investor presentation") rather than conversational turns, reinforcing that this panel's primary unit of work is a "task," matching the "New task" label at the top.

### 3.3 — `151` and `154` — Overflow menu ("···")

Identical content captured twice:

- **App settings** (external-link arrow icon — opens full ChatGPT settings, presumably in a new tab)
- **Chrome computer use settings** (external-link arrow icon — opens Chrome's own extension/computer-use permission settings)
- Divider
- **"ChatGPT for Chrome"** label, version **v1.2.27221.15725**

### 3.4 — `152` — Attach ("+") menu

Opened from the composer's **+** button. Two labeled sections:

**Add**

- 📁 **Files and folders**
- 🎯 **Goal** — "Set a goal to keep pursuing"
- 💡 **Plan mode** — "Turn plan mode on"

**Plugins**

- 📄 **Documents** — "Create and edit document artifacts"
- 📕 **PDF** — "Read, create, and verify PDF files"
- 🟩 **Spreadsheets** — "Create and edit spreadsheet files"
- 🟧 **Presentations** — "Create and edit presentations"
- 🎨 **Template Creator** — "Create or update templates…" (truncated)
- 🔷 **Sites** — "Build and deploy websites with Sites"

List is scrollable/cropped at "Sites" — more plugin rows may exist below but were not captured (not covered by these captures).

"Goal — Set a goal to keep pursuing" and "Plan mode — Turn plan mode on" are notable as extension-only affordances not seen identically worded on the main web Plugins settings page — they read as **persistent/standing-goal** and **explicit plan-before-act** controls specific to the agentic task panel.

### 3.5 — `153` — Advanced settings / effort slider

A popover anchored above the composer:

- **"Advanced ›"** label with a lightning-bolt icon (expandable/collapsible — shown expanded here)
- Below it, a **horizontal slider** with 5 discrete stop-points (dots), the thumb currently resting at roughly the **2nd of 5** positions (low-but-not-minimum effort)

No numeric or text label is visible on the slider itself in this capture — the position is inferred only from the thumb's location relative to the 5 dots. This is almost certainly the same "effort"/intelligence-tier control seen elsewhere (macOS "Light" effort dropdown, web "Intelligence" tiers Instant/Medium/High/Extra High/Pro) but rendered here as a continuous-looking slider rather than a discrete dropdown list — worth flagging as a UI inconsistency between surfaces (dropdown-list vs. slider for what is conceptually the same effort control).

---

## Part 4 — Synthesis

### 4.1 Full settings tree (web), verbatim

```
Settings (modal)
├── General
│   ├── Appearance (Dark/Light/System-style dropdown)
│   ├── Contrast (dropdown)
│   ├── Accent color (swatch + dropdown)
│   ├── Language (dropdown)
│   ├── Higher intelligence (toggle)
│   ├── Enable Ultra effort (toggle)
│   └── Enable Dictation (toggle)
├── Notifications
│   ├── Codex (Push/Email dropdown)
│   ├── Group chats
│   ├── Marketing
│   ├── Personalized tips
│   ├── Projects
│   ├── Responses
│   ├── Tasks (+ "Manage tasks" link)
│   └── Usage
├── Personalization
│   ├── Base style and tone (dropdown)
│   ├── Characteristics
│   │   ├── Warm
│   │   ├── Enthusiastic
│   │   ├── Headers & Lists
│   │   └── Emoji
│   ├── Fast answers (toggle)
│   ├── Suggested prompts (toggle)
│   ├── Custom instructions (textarea)
│   ├── Pet
│   │   └── Default → Select pet
│   ├── About you
│   │   ├── Nickname
│   │   ├── Occupation
│   │   └── More about you
│   ├── Memory
│   │   ├── Enable memory (toggle)
│   │   └── Memory summary → Manage
│   ├── Record mode
│   │   └── Reference record history (toggle)
│   └── Advanced (collapsed — not covered)
├── Plugins
│   ├── Permissions → Allow low-risk actions
│   ├── [connector/plugin list: Build iOS Apps, Build macOS Apps, Build MCP Apps,
│   │    Build Web Apps, Codex Browser Recorder, Default templates, Documents,
│   │    Expo, GitHub, Google Drive, OpenAI Developers, PDF, Presentations,
│   │    Sales, Spreadsheets, Vercel, Browse plugins]
│   └── Developer mode
├── Voice
│   ├── Voice picker (carousel, e.g. "Spruce")
│   ├── Model (dropdown, e.g. "Live")
│   ├── Intelligence (dropdown, e.g. "Instant")
│   └── Language (dropdown)
├── Billing
│   ├── Plan summary (+ Compare plans)
│   ├── Billing history (+ View)
│   ├── Billing information (+ Edit)
│   ├── Payment methods (+ Add new)
│   └── Cancel plan
├── Usage
│   ├── Weekly usage limit (progress bar)
│   ├── Usage limit resets
│   ├── Credits (+ Buy credits)
│   └── Automatic recharge (toggle)
├── Data controls
│   ├── Improve the model for everyone
│   ├── Location (+ Turn on)
│   ├── Work network access
│   ├── Reset ChatGPT Work
│   ├── Shared links (+ Manage)
│   ├── Archived chats (+ Manage)
│   ├── Archive all chats
│   ├── Delete all chats
│   ├── Export data
│   └── Marketing privacy
├── Cloud browser
│   ├── Default permissions (dropdown)
│   ├── Site permissions (+ Add site)
│   └── Cookies (+ Clear all)
├── Storage
│   ├── Usage meter (MB of 100 GB)
│   ├── Files (+ count/size)
│   └── Images (+ count/size)
├── Safety
│   └── Reduce sensitive content (toggle)
├── Security and login
│   ├── Password (+ Add)
│   ├── Security keys & passkeys (count)
│   ├── Multi-factor authentication (MFA)
│   │   ├── Authenticator app (toggle)
│   │   └── Text message (toggle, + phone number)
│   ├── Sessions
│   │   └── Active sessions (count)
│   ├── Advanced security
│   │   ├── Advanced account security (+ Enroll)
│   │   └── Lockdown mode (toggle)
│   ├── Developer mode
│   │   ├── Developer mode [ELEVATED RISK] (toggle)
│   │   └── Enforce CSP in developer mode (toggle)
│   └── Secure sign in with ChatGPT
│       ├── Codex CLI (+ Disconnect)
│       └── Enable device code authorization for Codex (toggle)
├── Parental controls
│   └── Add family member
├── Trusted contact
│   └── Add contact
├── Account
│   ├── Name
│   ├── Username
│   ├── Email
│   ├── Delete account
│   └── GPT builder profile
│       ├── Preview card
│       ├── Name (toggle)
│       ├── Links (domain, LinkedIn, GitHub)
│       └── Email (+ Receive feedback emails checkbox)
└── Keyboard
    ├── Composer (5 rebindable shortcuts)
    └── App (8 rebindable shortcuts)
```

### 4.2 macOS desktop app settings tree (distinct from web — grouped rail)

```
Settings (window)
├── Personal
│   ├── General ← (Permissions: Default permissions / Auto-review / Full access;
│   │              General: file-open destination, language, menu bar, bottom panel,
│   │              terminal location, prevent sleep, Speed)
│   ├── Profile
│   ├── Appearance
│   ├── Voice
│   ├── Configuration
│   ├── Personalization
│   ├── Pets
│   ├── Keyboard shortcuts
│   ├── Usage & billing
│   └── Account (↗ opens web)
├── Integrations
│   ├── Appshots
│   ├── Plugins
│   ├── Browser
│   └── Computer use
├── Coding
│   ├── Hooks
│   ├── Connections
│   ├── Git
│   ├── Environments
│   └── Worktrees
└── Archived
    └── Archived chats
```

The macOS rail groups into **Personal / Integrations / Coding / Archived**; the web modal is a flat, ungrouped list. The web list has entries the macOS rail's captured page does not show directly (Notifications, Data controls, Cloud browser, Storage, Safety, Security and login, Parental controls, Trusted contact) — "Account" on macOS instead deep-links out to the web surface for those, per the external-link arrow icon next to "Account" in the macOS rail. The "Coding" group (Hooks/Connections/Git/Environments/Worktrees) has **no equivalent on the web settings list at all** — it is desktop-app-only in this capture set.

### 4.3 Control inventory table

| Screen                | Control                                                                                  | Type                                                     | What it appears to do                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| macOS General         | Default permissions                                                                      | Toggle                                                   | Lets ChatGPT read/edit files in its workspace by default                                   |
| macOS General         | Auto-review                                                                              | Toggle                                                   | Auto-approves ChatGPT's own requests for additional file access                            |
| macOS General         | Full access                                                                              | Toggle                                                   | Grants edit-any-file + run-network-commands without per-action approval                    |
| macOS General         | Default file open destination                                                            | Dropdown                                                 | Chooses which app opens files/folders ChatGPT produces                                     |
| macOS General         | Default terminal location                                                                | Segmented control (Bottom/Right)                         | Where terminal tabs open for shortcut/environment actions                                  |
| macOS General         | Speed                                                                                    | Dropdown                                                 | Throttles execution speed "across chats, subagents, and compaction"                        |
| macOS General         | Show in menu bar                                                                         | Toggle                                                   | Keeps app resident in macOS menu bar when window closed                                    |
| macOS General         | Prevent sleep while running                                                              | Toggle                                                   | Caffeinate-style keep-awake during task execution                                          |
| macOS Chat/Work       | Chat/Work segmented toggle                                                               | Segmented control                                        | Switches composer context between conversational chat and task/agent "Work" mode           |
| macOS Work composer   | Quick-action rows (Create a file / Research / Automate)                                  | List/buttons                                             | Pre-seeded task prompts, Work-mode only                                                    |
| macOS model picker    | Intelligence tier list                                                                   | Radio-style list (checkmark)                             | Instant/Medium/High/Extra High/Pro effort tiers                                            |
| macOS model picker    | Model submenu ("GPT-5.6 Sol ›")                                                          | Nested menu                                              | Separate model-family selector orthogonal to intelligence tier                             |
| Web General           | Higher intelligence                                                                      | Toggle                                                   | Auto-escalates model tier on complex questions                                             |
| Web General           | Enable Ultra effort                                                                      | Toggle                                                   | Runs "multiple agents in parallel," consumes usage faster                                  |
| Web General           | Enable Dictation                                                                         | Toggle                                                   | Enables voice-to-text in composer                                                          |
| Web Notifications     | Per-category channel dropdown (×8 rows)                                                  | Dropdown (multi-select-style: Push / Email / Push,Email) | Per-category notification channel selection                                                |
| Web Personalization   | Base style and tone                                                                      | Dropdown                                                 | Sets default response tone/persona                                                         |
| Web Personalization   | Characteristics (Warm/Enthusiastic/Headers & Lists/Emoji)                                | 4× Dropdown                                              | Fine-grained stylistic sliders layered on base tone                                        |
| Web Personalization   | Fast answers                                                                             | Toggle                                                   | Lets model answer from general knowledge without memory/personalization                    |
| Web Personalization   | Suggested prompts                                                                        | Toggle                                                   | Generates suggestions "based on searching connected plugins"                               |
| Web Personalization   | Pet → Select pet                                                                         | Link/picker                                              | Chooses a visual "companion" persona                                                       |
| Web Personalization   | Enable memory                                                                            | Toggle                                                   | Master switch for cross-chat personalization memory                                        |
| Web Personalization   | Memory summary → Manage                                                                  | Button                                                   | Opens memory-content review/edit UI                                                        |
| Web Personalization   | Reference record history                                                                 | Toggle                                                   | Lets model use prior voice-recording transcripts/notes as context                          |
| Web Plugins           | Allow low-risk actions                                                                   | Link (opens permission-level picker)                     | Sets default plugin permission strictness                                                  |
| Web Plugins           | Connector rows (GitHub, Google Drive, Vercel, Expo, etc.)                                | List rows, chevron                                       | Per-connector configuration/OAuth management                                               |
| Web Plugins           | Developer mode row                                                                       | Link                                                     | Entry point to add unverified/custom connectors                                            |
| Web Voice             | Voice carousel                                                                           | Carousel picker                                          | Selects TTS voice persona (9 options)                                                      |
| Web Voice             | Model                                                                                    | Dropdown                                                 | Voice engine selection ("Live")                                                            |
| Web Billing           | Compare plans                                                                            | Button                                                   | Opens plan comparison/upgrade flow                                                         |
| Web Billing           | Payment method ⋮ menu                                                                    | Overflow menu                                            | Manage/remove a saved card                                                                 |
| Web Billing           | Cancel plan → Cancel                                                                     | Destructive button                                       | Cancels subscription, retains access till period end                                       |
| Web Usage             | Buy credits                                                                              | Button                                                   | Opens pay-as-you-go credit purchase flow                                                   |
| Web Usage             | Automatic recharge                                                                       | Toggle                                                   | Auto-purchases credits when balance depletes                                               |
| Web Data controls     | Improve the model for everyone                                                           | Status link (On ›)                                       | Opt-in/out of training-data usage                                                          |
| Web Data controls     | Location → Turn on                                                                       | Button                                                   | Enables location-aware responses                                                           |
| Web Data controls     | Reset ChatGPT Work                                                                       | Destructive button                                       | Resets Work-mode state/data separately from chat                                           |
| Web Data controls     | Archive all / Delete all / Export                                                        | 3× Button                                                | Bulk chat lifecycle actions                                                                |
| Web Cloud browser     | Default permissions                                                                      | Dropdown                                                 | Always ask / (other options not captured) before opening sites                             |
| Web Cloud browser     | Add site                                                                                 | Button                                                   | Per-site permission override                                                               |
| Web Cloud browser     | Clear all (cookies)                                                                      | Destructive button                                       | Wipes cloud-browser cookie jar                                                             |
| Web Storage           | Files / Images rows                                                                      | List rows, chevron                                       | Drill into stored file/image library to free space                                         |
| Web Safety            | Reduce sensitive content                                                                 | Toggle                                                   | Adds safeguards, limits sensitive-topic content                                            |
| Web Security          | Security keys & passkeys                                                                 | Status link (count ›)                                    | Manage WebAuthn credentials                                                                |
| Web Security          | Authenticator app / Text message                                                         | 2× Toggle                                                | MFA method enablement                                                                      |
| Web Security          | Active sessions                                                                          | Status link (count ›)                                    | Device/session review and remote logout                                                    |
| Web Security          | Advanced account security → Enroll                                                       | Button                                                   | Opts into strictest sign-in requirements                                                   |
| Web Security          | Lockdown mode                                                                            | Toggle                                                   | Anti-prompt-injection: restricts web/external-service-connecting features                  |
| Web Security          | Developer mode [ELEVATED RISK]                                                           | Toggle                                                   | Allows unverified connectors that can modify/erase data                                    |
| Web Security          | Enforce CSP in developer mode                                                            | Toggle                                                   | Restricts network access for dev-mode apps lacking a declared CSP                          |
| Web Security          | Codex CLI → Disconnect                                                                   | Destructive button                                       | Revokes Codex CLI's API access grant                                                       |
| Web Security          | Enable device code authorization for Codex                                               | Toggle                                                   | Enables OAuth device-code flow for headless Codex CLI sign-in                              |
| Web Parental controls | Add family member                                                                        | Button                                                   | Starts account-linking flow for family supervision                                         |
| Web Trusted contact   | Add contact                                                                              | Button                                                   | Registers an emergency contact for suicide-risk escalation                                 |
| Web Account           | Delete account → Delete                                                                  | Destructive button                                       | Account deletion                                                                           |
| Web Account           | GPT builder profile → Name/Links toggles                                                 | Toggles + Add buttons                                    | Controls what's shown publicly on shared GPTs                                              |
| Web Keyboard          | Per-shortcut toggle + rebind                                                             | Toggle + click-to-record                                 | Enable/disable and remap 13 shortcuts across Composer/App                                  |
| Extension             | New task ▾                                                                               | Dropdown                                                 | Switches between composing a new task and browsing task history                            |
| Extension             | Search recent tasks                                                                      | Search field                                             | Filters task history list                                                                  |
| Extension             | + (Add) menu → Files and folders / Goal / Plan mode                                      | Menu items                                               | Attach context, set a standing goal, or force explicit planning before action              |
| Extension             | + (Add) menu → Plugins (Documents/PDF/Spreadsheets/Presentations/Template Creator/Sites) | Menu items                                               | Invoke specific artifact-generation plugins directly from the panel                        |
| Extension             | ··· overflow → App settings / Chrome computer use settings                               | Menu items (external link)                               | Deep-link to full settings and to Chrome's own computer-use permission page                |
| Extension             | Advanced ▾ effort slider                                                                 | Expandable + slider (5 stops)                            | Sets task effort/intelligence level, extension-specific slider UI                          |
| Extension             | Full access chip                                                                         | Status chip (non-interactive in capture)                 | Displays current permission level inline in composer, echoes macOS's "Full access" concept |

### 4.4 Notable design decisions

- **Progressive disclosure via risk labeling, not just menu depth.** "Full access," "Developer mode," and destructive actions (Delete all chats, Cancel plan, Delete account, Disconnect Codex CLI) are all styled in orange/red and paired with explicit risk-explaining copy inline, rather than hidden behind a generic "Advanced" toggle. Two settings even carry an explicit **"ELEVATED RISK"** badge (Developer mode) versus a plain orange triangle for "Full access" — a two-tier risk-labeling vocabulary.
- **One flat settings list on web, grouped rail on desktop.** The web modal never groups its 16 sections under headers; the macOS window groups the same conceptual territory into Personal/Integrations/Coding/Archived. This is a real information-architecture divergence between the two surfaces built from (presumably) the same backend settings.
- **Cross-surface duplication of the same primitive with different widgets.** The "effort/intelligence" concept appears as: a dropdown list with checkmark (macOS model picker), a dropdown (Web General → Intelligence-adjacent "Higher intelligence" toggle + separate "Enable Ultra effort" toggle), and a raw 5-stop slider with no visible label (browser extension "Advanced" panel). Three different widget types for what is conceptually one lever.
- **Destructive/irreversible actions are consistently red-outlined buttons, never solid-red or icon-only** — Cancel plan, Delete all chats, Delete account, Clear all cookies, Reset ChatGPT Work, Disconnect Codex CLI all share this same outline-button treatment, giving a single consistent "danger" affordance across 6+ different pages.
- **Safety features are split into three separate, differently-scoped pages** (Safety = content-strictness toggle; Parental controls = account-linking for minors; Trusted contact = suicide-risk emergency contact) rather than being consolidated — each has distinct, carefully-worded consumer-facing copy, especially Trusted contact's specific mention of proactively notifying a contact "if you discuss suicide... in a way that indicates a serious safety concern."
- **Codex is woven into consumer-facing surfaces in multiple places**, not confined to a developer console: a Notifications category, a Security-and-login connected-app row with its own Disconnect and device-code-auth toggle, a "Codex Browser Recorder" plugin, and (on macOS) an entire "Coding" settings group (Hooks/Git/Worktrees/Environments) plus Work-mode composer copy. This is one product surface, not two.
- **Empty states are short, human, and mode-specific**: "Ready when you are." (Chat) vs. "What should we work on?" (Work) vs. "Do anything" (extension composer placeholder) — three different empty-state voices for three different framings of essentially the same text-input affordance.
- **The extension's task list reads as goal-oriented agent tasks, not chat turns** ("Map repo architecture," "Create investor presentation"), and the extension's own attach menu offers "Goal" (persistent) and "Plan mode" (explicit pre-action planning) — concepts not present verbatim in the main web Plugins/attach surface, suggesting the extension is deliberately tuned toward standing, multi-step agent work rather than one-off chat.

### 4.5 Capabilities visible here that documentation would likely not surface

- **A device-code OAuth flow for Codex CLI exists inside consumer account-security settings**, with explicit end-user phishing-awareness copy ("device codes can be phished. Never share a device code.") — this reveals both the auth mechanism and that OpenAI anticipated headless/remote CLI use enough to build a dedicated toggle and warning for it.
- **"Lockdown mode" explicitly targets prompt-injection** in plain end-user language and is scoped to "limiting features that can connect to the web or external services" — confirms prompt injection is treated as a named, toggle-able attack surface at the consumer settings layer, not just an internal engineering concern.
- **Usage/credits are pooled across "Codex, Work, Workspace Agents, and ChatGPT for Excel"** and explicitly exclude ordinary chat conversations — this reveals the internal metering boundary between "agentic/task" consumption and "conversational" consumption, and confirms "ChatGPT for Excel" exists as a named product.
- **"Enforce CSP in developer mode"** reveals that Developer-mode connector apps run with a **relaxed/unrestricted-network default Content-Security-Policy unless this toggle is turned on** — a specific, security-relevant default (insecure-by-default network access for dev-mode apps) that is very unlikely to be stated in general marketing or even most technical docs.
- **The macOS app's permission triad (Default permissions → Auto-review → Full access) is a graduated trust ladder**, each rung strictly increasing blast radius (read/edit workspace files → auto-approve additional access → edit any file + run network commands without approval) — the exact shape of this ladder, and that "Auto-review... can make mistakes" is stated as a caveat on the _middle_ rung specifically, is only visible by reading the actual toggle copy, not summarized elsewhere.
- **The extension's "Full access" chip is a persistent, always-visible composer-level indicator** of the current permission tier (mirroring the macOS full-access toggle state) rather than something tucked into a settings page — meaning permission level is designed to be visible at the point of every task submission, not just configured once and forgotten.
- **"Codex Browser Recorder" as an installed plugin** implies a recording-to-automation pipeline (record a browser session → generate a repeatable Codex task) that isn't otherwise named in this settings surface — its existence as a plugin row is the only evidence of this capability in the captured set.
- **GPT builder profile defaults to a literal placeholder identity** ("PlaceholderGPT," "By Siddhartha Nagula") even for a paid Pro account with no custom instructions filled in — shows the builder-profile system ships with an unbranded default rather than blank/empty fields, a detail only visible by inspecting a real, unconfigured account.

### 4.6 iOS settings tree comparison

**Not covered by these captures.** This assigned screenshot set contains only `chatgpt-web-*` and `chatgpt-macos-*` files; no `chatgpt-ios-*` files were present in any of the three source directories for this pattern. No comparison to an iOS settings tree can be made from this evidence — a separate iOS-focused capture set would be required.
