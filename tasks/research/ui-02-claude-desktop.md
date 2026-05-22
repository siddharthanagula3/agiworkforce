# UI Research 02 — Claude Desktop (Anthropic)

**Source:** `~/Desktop/reference/ui/claude/claude-desktop/` (39 PNG, captured 2026-03-28).
**Index:** `~/Desktop/reference/ui/INDEX.md` lines 50–91.

Pixel-grounded teardown of Claude Desktop, focused on our unification work — collapsing Anthropic's three-tab Desktop split (Chat / Cowork / Code) into one chat surface with opt-in isolation per conversation. Every claim cites a filename.

---

## 1. Top-level Shell & Window Chrome

### Collapsed sidebar / empty state (`01_empty-state_new-chat-collapsed-sidebar.png`)

Frameless window with thin black title bar (~22 px). Collapsed left rail (~46 px) holds a vertical icon stack:

1. Sidebar-toggle
2. Back / Forward chevrons (in-app history)
3. `+` New chat
4. `🔍` Search
5. `💼` Customize
6. `💬` Chats
7. `📁` Projects
8. `✨` Artifacts
9. `</>` Code
10. Download icon (footer — Get apps)
11. Avatar `SN` (footer — profile popover)

Top-right of the window: a single chat-bubble icon (Claude help/feedback). Background is warm-charcoal `#1A1916`; cards `#252320`.

### Expanded sidebar (`02_sidebar-expanded_chat-history.png`)

Width ~240 px. Same icons get labels. Below the nav block: a flat **"Recents"** section listing 16 conversation titles, no date headers, no project grouping, recency-only. Bottom: `Siddhartha Nagula / Free plan` row + download/import-export icons.

**Note:** `</>` Code is a top-level sibling destination, not a mode-within-chat. Confirms Anthropic treats Claude Code as a separate surface.

---

## 2. Conversation Surface

### Empty new-chat (`01`)

Single composer card centered, ~620 px wide:

- Above the heading: `Free plan · Upgrade` pill.
- Title: large serif "✱ Golden hour thinking" (a daypart-rotating empty-state title).
- Composer card with placeholder "How can I help you today?", footer-left `+` attachment, footer-right `Sonnet 4.6 Extended ⌄` model+mode pill, then mic icon.
- 5 action chips below: `</> Code`, `✏️ Write`, `🎓 Learn`, `From Drive`, `From Gmail`. The last two are **connector-aware quick starters**.

### Three-pane project layout (`05_three-pane-layout_sidebar-chat-project.png`)

Inside a project: left = expanded nav (~150 px), center = project body (title + composer + error banner + chronological message-thread list with "Last message N days ago"), right = project knowledge panel.

Project pattern: a project = folder of related conversations + persistent knowledge + persistent instructions. Conversation list within is flat.

### Project detail with knowledge (`04_project-detail_knowledge-panel_error-banner.png`)

Project "claude Prompt": center column has composer + a destructive **red banner**: _"Project knowledge exceeds maximum. Remove files to continue."_ — full-width, warning-icon, above the message list.

Right pane (Knowledge panel) sections:

- **Memory** — `Only you` privacy chip, paperclip icon. Body shows actual remembered facts ("Purpose & context Siddhartha is the solo founder of AGI AUTOMATION LLC and creator of AGI Workforce — a model-agnostic, multi-LLM…"). "Last updated 13 days ago".
- **Instructions** — `+` to add. "Add instructions to tailor Claude's responses".
- **Files** — capacity meter (`326% of project capacity used` with red bar), then file cards. Files are tagged by type: `GITHUB` (3 cards: anthropics/claude-code, anthropics/claude-cookbooks, anthropics/claude-plugins-official) and `TEXT` (cards for "claude agents in AGI workforce", "skills in AGI Workforce", "Context management Compaction", "Fine-grained tool streaming", "Programmatic tool calling", "Context management Context windows").

### Chats history (`06_chats-history-management-view.png`)

Dedicated `Chats` destination: centered title, `+` button (new chat), search input "Search your chats…", below it a row `Your chats with Claude   Select` (Select for bulk ops). Flat, recency-ordered list with "Last message N hours/days ago" timestamps. No project/date grouping visible.

### Cowork tab / Code tab — critical absence

**None of the 39 screenshots show Cowork or Code as in-app conversation tabs.** What we see:

- The `</>` Code item navigates to a Settings → Claude Code auth-tokens page (`16_settings-claude-code-auth-tokens.png`).
- Cowork appears only in **Settings → Billing's plan-features** ("Power through tasks with Cowork" — `11`) and in the **integrations marketing modal** ("Cowork: Hand off complex tasks. Only on desktop. [Upgrade]" — `37`, `38`).

Either Cowork is gated behind Pro and the captured user is Free, or **Cowork has not yet shipped as a Desktop tab as of capture**. The integrations modal even tags Cowork with **"Only on desktop"**, confirming it's a Desktop-app feature, but not visibly a tab. **Strategic asymmetry in our favor**: our unification thesis is differentiated because Anthropic hasn't built a unified shell yet.

### Right-click menus / search modal

Not visible in any screenshot. The closest is `⋮` ellipsis buttons on Active Sessions rows (`09`) and Connector list rows (`14`) — destination behavior unknown.

---

## 3. Sidebar / Navigation summary

| Icon  | Label     | Destination                     |
| ----- | --------- | ------------------------------- |
| `+`   | New chat  | Empty composer                  |
| `🔍`  | Search    | Modal/spotlight (no screenshot) |
| `💼`  | Customize | Multi-pane shell (`21`)         |
| `💬`  | Chats     | Flat list (`06`)                |
| `📁`  | Projects  | Gallery (`03`) → detail (`04`)  |
| `✨`  | Artifacts | Not screenshotted               |
| `</>` | Code      | Settings → Claude Code (`16`)   |

Recents in `02` and `06` are **flat, un-grouped, recency-ordered**. No pinning, no folders, no date headers. Conversation titles are truncated mid-word.

---

## 4. Settings IA (10 tabs, two-section split)

The Settings shell is a centered ~660 px content column with a left rail split into:

**Account-scoped:** General, Account, Privacy, Billing, Capabilities, Connectors, Claude Code.
**"Desktop app" sub-header below divider:** General, Extensions, Developer.

The split separates "this account, moves with me" from "this machine". Strong precedent for our BYOK + Local + multi-machine IA.

### 4.1 General (`07_settings-general-tab.png`)

- **Profile:** `Full name` (avatar + text), `What should Claude call you?` text input, `What best describes your work?` dropdown (current "Product management"), `What personal preferences should Claude consider in responses?` multi-line text area with placeholder "e.g. ask clarifying questions before giving detailed answers". Helper: "Your preferences will apply to all conversations, within Anthropic's guidelines."
- **Notifications:** `Response completions` toggle (ON) — "Get notified when Claude has finished a response. Most useful for long-running tasks like tool calls and Research."
- **Appearance** (continued in `08`): Color mode (3 cards: **Light / Auto / Dark**), Background animation (3 cards: **Enabled / Auto / Disabled**), Chat font (4 `Aa` cards: **Default / Sans / System / Dyslexic friendly**).

### 4.2 Account (`09_settings-account-active-sessions.png`)

- `Log out of all devices` — `[Log out]` button.
- `Delete your account` — `[Delete account]` destructive button.
- `Organization ID` — read-only string + copy icon (e.g., `7c909893-25e3-410e-82b3-e40a25ed49b1`).
- **Active sessions table:** Device | Location | Created | Updated | `⋮`. Visible rows: Mobile Safari (iOS), Chrome (Mac OS X) ×2, Claude (iOS), Claude Desktop (Mac OS X — tagged `Current`).

### 4.3 Privacy (`10_settings-privacy-tab.png`)

- Privacy header card with collapsibles "How we protect your data ›" / "How we use your data ›" + Privacy Center / Privacy Policy links.
- Settings: `Export data` (button), `Shared chats` (Manage), `Memory preferences` (Manage ↗ external), `Location metadata` toggle (OFF), `Help improve Claude` toggle (OFF) — sub-copy: "Allow the use of your chats and coding sessions to train and improve Anthropic AI models."

### 4.4 Billing (`11_settings-billing-tab.png`)

- Free plan card with feature checklist + `[Upgrade plan]`.
- **Invoices table:** Date | Due | Total | Status | Actions. Even though the user is Free, multiple paid invoices appear (e.g. `$118.10 Paid`, `$85.96 Paid`, `$21.32 Paid`) — Anthropic shows full history regardless of current tier.

### 4.5 Capabilities (`12`, `13`)

The densest settings page.

**Memory:**

- `Generate memory from chat history` toggle (ON). Sub-copy: "This setting controls memory for both chats and projects."
- Below: a **memory preview card** showing a snippet of the actual remembered text, "Updated 11 hours ago from your chats".
- `Import memory from other AI providers` with `[Start import]` — "We'll provide a prompt you can use to fetch the memory from your other account."

**Tool access:**

- `Tool access mode` radios:
  - `Load tools when needed` (selected) — "Chats compact less since tools aren't pre-loaded."
  - `Tools already loaded` — "Chats compact more often since tools are always there."

**Visuals:**

- `Artifacts` toggle (helper explains the dedicated-window pattern).
- `AI-powered artifacts` toggle — apps/prototypes/interactive docs that use Claude inside the artifact.
- `Inline visualizations` toggle — charts and diagrams in conversation.

**Code execution and file creation (`13`):**

- `Code execution and file creation` toggle (ON).
- Nested `Allow network egress` toggle — "Allow Claude to access common package managers… View package manager domains. Monitor chats closely as this comes with security risks."

**Skills banner (`13`):** "Skills have moved to Customize. Head to the new Customize page to manage your skills and connectors. **[Go to Customize]**". This banner repeats on the Connectors tab (`14`) — Anthropic is **mid-migration**: Skills + Connectors live in both Settings AND the new Customize destination simultaneously.

### 4.6 Connectors — Settings version (`14`, `15`)

Same migration banner. Two-tier list:

- Section header `Allow Claude to reference other apps and services for more context.` + right-aligned `[Browse connectors]`.
- **Web connectors:** Google Drive (`Connected`), GitHub Integration (`Connected`), Airtable (`[Configure]`), Gmail (`[Configure]`), Vercel (`[Configure]`), Google Calendar (`[Connect]`), n8n (`[Connect]`).
- **Desktop connectors** (each tagged `DESKTOP` next to name, in `15`): Apify, Context7, Control your Mac, Desktop Commander, Excel (By Anthropic), Filesystem, Read and Write Apple Notes — all `[Configure]`.
- Footer: `[Add custom connector]` + "Looking for desktop extensions? Manage them here" link.

State indicators: **Connected** (orange) | **[Configure]** (loaded but needs setup) | **[Connect]** (not yet OAuth'd).

### 4.7 Claude Code (`16_settings-claude-code-auth-tokens.png`)

- Hero card with logo + tagline + "Upgrade to Max or Pro ↗".
- Info banner: "How does usage work? When you sign in to Claude Code using your subscription, your subscription usage limits are shared with Claude Code."
- **Manage your authorization tokens** — each row shows "Claude Code", `↺ Connected N days ago`, **scope-tag chips** in monospace pills: `user:file_upload`, `user:inference`, `user:profile`. Trash icon to revoke. 6 visible rows.

### 4.8 Desktop app → General (`17`)

- `Run on startup` toggle (OFF).
- `Quick access shortcut` dropdown — current **"Tap Option twice"** (system-wide global hotkey to message Claude from anywhere).
- `Voice shortcut` dropdown — current "No shortcut".
- `Menu bar` toggle (ON).
- `Keep computer awake` toggle (ON) — "Prevent your computer from idle-sleeping while Claude is open so scheduled tasks can run. Your display can still turn off. Closing the laptop lid will still put it to sleep."

### 4.9 Desktop app → Extensions (`18`)

`Allow Claude to directly interact with apps, data, and tools on your computer.` + `[Browse extensions]`.

`Installed on your computer:` Filesystem, Excel (By Anthropic), Read and Write Apple Notes, Apify, Control your Mac, Tableau, Desktop Commander, Context7 — each with `[Configure]` and `⋮`.

Footer: `[Advanced settings]` + dashed-border drop-zone **"📍 Drag .MCPB or .DXT files here to install"**.

### 4.10 Desktop app → Developer (`19`)

`Local MCP servers / Add and manage MCP servers that you're working on.` + `[Edit Config]` (opens config externally).

Left-rail server list, right-pane detail (Filesystem selected): `running` green pill, "This server is managed by an extension".

- **Command:** `node`
- **Arguments:** `/Users/siddhartha/Library/Application Support/Claude/Claude Extensions/ant.dir.ant.anthropic.filesystem/server/index.js /Users/siddhartha/Desktop`
- `[View Logs]`.

Add/delete UI delegates to JSON config; live status via `running` pill.

---

## 5. Customize destination (`21_customize-claude-landing-page.png`)

New home for **Skills + Connectors + Plugins**. Layout:

- **Left rail** (~150 px): "← Customize" header, then `Skills` and `Connectors`. Below: `Personal plugins +` section — 16 vertical plugin entries (Legal, Slack by salesforce, Common room, Brand voice, Apollo, Product management, Productivity, Enterprise search, Sales, Finance, Data, Marketing, Design, Engineering, Operations, Customer support).
- **Center pane:** Hero — briefcase icon, "Customize Claude / Skills, connectors, and plugins shape how Claude works with you." Three CTA cards: **Connect your apps**, **Create new skills**, **Browse plugins**.

### 5.1 Skill detail (`22_skill-detail-view_humanizer.png`)

Three-pane: Customize rail | Skills middle column (humanizer selected with child files SKILL.md, README.md, WARFind; Examples list of 9 skills like algorithmic-art, brand-guidelines, mcp-builder, skill-creator, slack-gif-creator) | Skill page on right with header (Added by User, Last updated Mar 18 2026, Invoked by User or Claude, **enable toggle ON**), Description prose, **Allowed tools chip strip** (`Read, Write, Edit, Grep, Glob, AskUserQuestion`), then Markdown body ("Humanizer: Remove AI Writing Patterns" with numbered "Your Task" list).

A Skill is **a Markdown file with metadata** + bundled child files. Anthropic's model maps directly onto our `packages/skills` structure.

### 5.2 Connector detail template (`23`–`32`)

Consistent layout:

**Header strip:** Logo + name, `[Disconnect]` (or `[Connect]` if not OAuth'd — see Slack, `34`).

**Tool permissions section:** Header + tools grouped into expandable categories — `Read-only tools (N)`, `Write/delete tools (N)`, `Interactive tools (N)`, `Other tools (N)`.

**Per-category dropdown** (`23_connector-permissions-dropdown_airtable.png`) options:

- `Always allow` (default green-checked)
- `Needs approval`
- `Blocked`
- `Custom`

**Per-tool row icons** (3 small icons): checkmark / clock-with-pause / no-entry — interpreted as **Always allow / Approve each time / Block** for that specific tool. Three-tier granularity (master toggle → category dropdown → per-tool icons) is the gold standard for connector permissioning.

**Variants:**

- **Filesystem (`30`)** has extra `Allowed Directories (Required)` section with folder pickers, "+ Add directory", `[Save]`.
- **GitHub Integration (`25`)** is INFO-only (description with bullet points: Chat / Projects / Claude Code / And more) — no granular tool list, all-or-nothing OAuth.
- **Excel — Blocked (`29`)** entire category set to `Blocked` with tools visually de-emphasized in gray.
- **Apple Notes (`32`)** only `Other tools (4)` group, all blocked — conservative default.
- **Vercel (`26`)** read-only tool list of ~10 functions (e.g. `check_domain_availability_and_price`, `get_deployment_build_logs`, `list_projects`, `list_teams`).
- **Control your Mac (`27`)** `Enabled` green badge + `[Uninstall]`. Single tool: `osascript`. **AppleScript-as-LLM-tool** — exposes one primitive.
- **Desktop Commander (`28`)** Interactive tools (2): `Get Configuration`, `Read File or URL`. Read-only tools (12): `Read Multiple Files`, `List Directory Contents`, `Start Search`, etc. — heaviest desktop connector.

### 5.3 Connectors middle-column list (`23`–`32`)

Grouped:

- **`▾ Web`** — GitHub Integration, Gmail, Google Drive, Vercel.
- **`▾ Desktop`** with settings-gear icon — Apify, Context7, Control your Mac, Desktop Commander, Excel (By Anthropic), Filesystem, Read and Write Apple Notes.
- **`▾ Not connected`** — Airtable, Google Calendar, n8n, Tableau (low-opacity, dashed icons).

### 5.4 OAuth flow (`33_connector-oauth-flow_slack-grant-access-modal.png`)

Modal overlay over Slack detail. Title: **Grant access to Slack** with Slack-and-Claude logo dance (Slack logo, dotted line, orange Anthropic asterisk). Body: "Complete the sign-in in steps in the new browser tab." Below: "Didn't work? Relaunch the tab." link.

Anthropic offloads the OAuth challenge to a system browser, then waits for callback. **Modal is deliberately thin.**

### 5.5 Pre-connect Slack overview (`34_connector-overview_slack-details.png`)

- Hero: "Slack / Send messages, create canvases, and fetch Slack data" + `[Connect]`.
- **Two example use-case cards** (mini conversation thumbnails: "Draft Sean a message about attending our next startup event" / "Take last week's update and draft Jerome a message recapping everything").
- Body description.
- "Developed by Slack ↗" attribution.
- Trust disclaimer: "Only use connectors from developers you trust. Anthropic does not control which tools developers make available and cannot verify that they will work as intended or that they won't change."
- **Tools chip strip** (11 chips visible): `slack_send_message`, `slack_search_public_and_private`, `slack_search_users`, `slack_search_channels`, `slack_search_public`, `slack_read_channel`, `slack_read_thread`, `slack_create_canvas`.

A pre-connect page shows full transparency (name, OAuth provider, intended use, full tool list, trust disclaimer). **High-quality precedent for our connector marketplace.**

---

## 6. Profile popover (`20_profile-popover-menu.png`)

Anchored to bottom-left avatar:

- Email header (`siddharthanagula3@gmail.com`).
- `⚙ Settings   ⌘,` (with shortcut on right).
- `🌐 Language ›` (sub-menu).
- `❓ Get help`.
- — divider —
- `↑ Upgrade plan`.
- `↓ Get apps and extensions`.
- `🎁 Gift Claude`.
- `ⓘ Learn more ›`.
- — divider —
- `→ Log out`.

**No "Switch account"** — Claude Desktop is single-account-per-installation.

---

## 7. Plans / Pricing (`35`, `36`)

Title "Plans that grow with you". Tab toggle **`Individual` / `Team and Enterprise`**.

### Individual (`35`)

Three cards, billing toggle **Monthly | Yearly · Save 17%**.

- **Max** — "Higher limits, priority access". From `$100 USD / month, billed monthly`. Cancel anytime. Features: Up to 20x more usage than Pro\*, Early access to advanced Claude features, Higher output limits, Priority access at high traffic times, Claude in PowerPoint.
- **Pro** — "Research, code, and organize". `$17 USD / month, billed annually`. Features: Claude Code directly in your codebase, **Power through tasks with Cowork**, Higher usage limits, Deep research and analysis, Memory that carries across conversations.
- **Free** — "Meet Claude". `$0`. Features: Chat on web, iOS, Android, and desktop, Generate code and visualize data, Connect Slack and Google Workspace, Extended thinking for complex work, Built-in web search.

Footer: `*Usage limits apply. Prices shown don't include applicable tax.`

### Team / Enterprise (`36`)

- **Team** (`5–150 users`): Standard seat $20/mo (`$25/mo when billed monthly`), Premium seat $100/mo (`$125/mo when billed monthly`, 5x more usage). Features: 200K context window, Extra usage at API rates, Claude Code, Cowork, SSO + domain capture, Admin controls for connectors, Enterprise deployment, Connect Microsoft 365/Slack, **No model training on your content by default**.
- **Enterprise** (`20+ users`): `$20/seat. Usage cost scales with model and task.` Pooled usage across org, Set user/org spend limits, 500K context window, Role-based access with fine-grained permissioning, SCIM, Audit logs, Compliance API, Network-level access control, Custom data retention, IP allowlisting, Google Docs cataloging.

---

## 8. Integrations marketing modal (`37`–`39`)

Title "Do more with Claude, everywhere you work". Cards:

- **Microsoft Office** (with `New` chip) — Excel, PowerPoint sub-rows, `[Upgrade]`.
- **Cowork** — "Hand off complex tasks so you can focus on other work. **Only on desktop.** [Upgrade]". Visual: messy folder of receipts illustration with sticky notes ("My downloads folder is a mess! Can you clean it up?", "Turn these receipts into an expense report", "Create a shopping list, go on Chrome, and make an order").
- **Claude Code** — Sub-rows: Terminal, VS Code, Desktop app, JetBrains, Slack — each external-arrow icon.
- **Mobile** — `[Download]` for iOS and Android.
- **Chrome** — "Claude navigates, clicks buttons, and fills forms in your browser. **Works in Cowork.** [Upgrade]". Visual: a Returns workflow with a "Wireless Headphones Pro" return modal.

---

## 9. Theming / Polish

**Default theme = Dark.** Inferred color tokens:

- Canvas `#1A1916` (warm charcoal); Cards `#252320`.
- Primary text `#E8E4DD` (warm off-white); muted `#8A857C` (warm gray).
- Accent / brand: orange-red `#D97757` (asterisk/spark icon, "Connected" status).
- Destructive: red `#E36060` (project-knowledge banner in `04`).
- Success: mint `#9FD9A1` (`running` pill in `19`, `Enabled` toggle in `27`).

**Typography:**

- Display: serif (Tiempos-style) — "Golden hour thinking", page titles.
- Body: system sans (Inter-style).
- Monospace for tool-tag chips, MCP arguments, code blocks.
- Microcopy is warm + casual, never imperative.

---

## 10. Onboarding / first-run

**No first-run onboarding screenshots in this folder.** The Customize landing page (`21`) functions as a guided next-step for already-signed-in users. Onboarding for a fresh install would be in a separate auth-flow set.

---

## 11. Capability indicators

| Indicator                                                | Visual                  | Meaning                       |
| -------------------------------------------------------- | ----------------------- | ----------------------------- |
| `Connected` (orange)                                     | Right of connector row  | OAuth complete                |
| `[Configure]`                                            | Right-aligned button    | Loaded, needs setup           |
| `[Connect]`                                              | Right-aligned button    | Not yet OAuth'd               |
| `running` (mint pill)                                    | MCP server detail       | Live MCP process              |
| `Enabled` (mint toggle)                                  | Top of connector detail | Master kill-switch            |
| `Always allow` / `Needs approval` / `Blocked` / `Custom` | Per-category dropdown   | Permission scope              |
| `Current` pill                                           | Active session row      | Logged-in device              |
| `DESKTOP` tag                                            | Next to connector name  | Local extension vs cloud      |
| `New` chip                                               | Next to product name    | Recently launched             |
| Per-tool icons (✓ / pause / 🚫)                          | Right of tool row       | Always / Approve each / Block |

---

## 12. Open Questions

1. **Cowork tab UX** — none of the 39 screenshots show Cowork as in-app destination. Tab? Modal? Separate window? Need a Pro-tier user mid-Cowork-task.
2. **Code tab UX (in-app)** — `</>` navigates to Settings (`16`). Is there an in-app Code mode beyond that? Integrations modal lists Terminal/VS Code/Desktop/JetBrains/Slack — suggests **Claude Code is launch-points-only inside Desktop**.
3. **Right-click context menus** — not visible in any screenshot. What does right-click on a message bubble offer? On Memory items? Artifacts?
4. **Search modal** — `🔍` icon and Chats-search input not shown in active state. Cmd+K modal? Inline filter? Full-page destination?
5. **Artifacts destination** — `✨` Artifacts has no screenshot. Gallery? Filterable? Grouped by project?
6. **Folder/project context picker** — empty composer (`01`) doesn't expose project selector or mode switcher beyond `Sonnet 4.6 Extended ⌄`. How does a user start a new chat _into_ an existing project (other than from project detail)?
7. **Extended thinking control** — "Extended" sits next to "Sonnet 4.6". Dropdown? Toggle? Modal? Need a screenshot of this open.
8. **Skills authoring** — `22` shows a skill _page_ but not an _editor_. Author SKILL.md inside Claude or only externally?
9. **Memory editing** — Capabilities (`12`) shows the memory text but unclear if user can edit/delete individual facts inline.
10. **Per-conversation tool access override** — Capabilities sets a global default. Is there a per-conversation knob? Our isolation thesis depends on per-chat-opt-in.
11. **Multiple Claude accounts** — popover (`20`) has Log out but no Switch account. Multi-account a Pro/Team-tier feature?
12. **Custom MCP add UX** — Customize → Connectors shows `[Add custom connector]` (`15`); Developer pane shows `[Edit Config]` (`19`). Is "Add custom" a guided form or just a JSON editor?
13. **Light theme** — every captured screenshot is dark. Need full Light-theme screenshots to validate contrast and palette.

---

## 13. Strategic takeaways for AGI Workforce unification

1. **Copy: 10-tab Settings IA split into "account" + "this device".** Maps cleanly to BYOK + Local mode + multi-machine.
2. **Copy: per-tool granular permissioning** (Always / Approve each / Block) at both category and tool level. Anthropic's connector permission UI is the gold standard.
3. **Copy: connector pre-connect transparency page** (`34`) — show developer attribution, full tool list, example use-cases, trust disclaimer **before** OAuth. Apply to MCP servers as well.
4. **Diverge: unify Chat + Cowork + Code into one chat surface.** Anthropic still treats Cowork as "only on desktop" and Code as a separate auth-page sibling. Our thesis (one chat, opt-in isolation per conversation) is differentiated _because Anthropic hasn't built it yet_.
5. **Diverge: multi-provider model picker.** "Sonnet 4.6 Extended ⌄" pill in `01` is single-vendor. Our equivalent must show 10+ providers (Claude/GPT/Gemini/Grok/Ollama/LMStudio) side-by-side. Keep the pill design, populate with multi-provider catalog.
6. **Diverge: switch-account in profile popover.** Anthropic doesn't ship it; BYOK + multi-org users need it.
7. **Copy: Customize destination as home for Skills + Connectors + Plugins.** Better IA than burying them in Settings tabs. Anthropic is mid-migration; we ship the unified version from day one.
8. **Copy: drop-zone for `.MCPB` / `.DXT` files** in Extensions (`18`). Lets users install MCP servers without touching JSON.
9. **Copy: scope-tag chips on Claude Code auth tokens** (`16`). When revoking, users see scope being killed. Apply to our CLI tokens.
10. **Copy: invoice history regardless of plan tier** (`11`). Free users see history. Reduces support load when users churn between tiers.
