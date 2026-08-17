# Benchmark Evidence: Codex VS Code Extension + Codex iOS Remote Control

**Scope of this document:** two halves of one assigned screenshot set —
(1) the Codex chat/agent extension embedded in a VS Code–derived editor ("Antigravity IDE"), covering onboarding, model upsell, permission modals, the plugins/attach menu, reasoning-effort menu, account menu, and the full multi-tab Settings surface; and
(2) Codex on iOS used as a **remote control for a paired desktop Mac** — OAuth consent, pairing (QR + manual code), project list, and remote-control settings.

All images live in `/Users/siddhartha/Desktop/chatgpt_reference/` and were captured as part of a 155-image corpus documented in `ChatGPT_Codex_UI_Reference_and_Build_Guide.md` in the same directory (read in full for cross-referencing; its own build-guide synthesis is summarized in §6 below). Every image assigned to this set (29 files total: 004–024, 027–030, 037–039, 058) was opened directly with the Read tool and visually inspected — findings below are grounded in what was actually seen on screen, not inferred from filenames.

## 0. Caveats (read before treating this as current spec)

- **Point-in-time captures, exact date known for this batch.** The corpus's own documentation states the VS Code-extension and iOS-remote screens in this set were captured in one continuous walkthrough on **2026-07-21, between 8:08 PM and 11:11 PM** (with the iOS remote-pairing images at 9:12–9:21 PM specifically). This is a single session on one developer's machine and one iPhone — not a multi-day or multi-tester sample.
- **The host editor is not vanilla VS Code.** The window chrome, title bar, and welcome hero all read **"Antigravity IDE"**, a VS Code–derived/forked editor, not Microsoft's own VS Code or the "Visual Studio Code" brand. The extension itself is branded **"Codex"**. Treat the surrounding IDE chrome (activity bar icons, the orange sparkle/asterisk icon, the flask icon that appears starting at image 008) as belonging to the host editor, not to the Codex extension — only the right-hand "Codex" panel and its own Settings tab are the actual product surface being benchmarked.
- **Model names are point-in-time and must not be hardcoded.** The screens show a live model-upsell flow from a starting model labeled **"5.6 Luna"** to a newly announced **"GPT-5.6 Sol"**, plus a billing screen referencing **"GPT-5.3-Codex-Spark"** as a distinct, separately-metered model. These are OpenAI's real product/version strings at time of capture, not ours — per repo policy, no model ID from this document should be hardcoded into product code; it's evidence of _pattern_ (a model-upsell modal exists, per-model usage limits exist), not a source of truth for literal IDs.
- **No confirmed-beta/experiment flags visible.** Nothing in this set is watermarked "beta," "experiment," or "internal" — the model-upsell modal is a normal in-product promotional pattern, not a labeled experiment.
- **The "0 errors / 1 warning → 0/0" status-bar drift across images 004–013** is incidental IDE lint state from the developer's own real repo, not app-generated content — ignore it as a signal.
- **Gaps in this assigned set:** images 025 (Claude iOS, explicitly an outlier/other-product capture), 026, 031–036 (chatgpt-ios and os-ios, not in this set), and 052–053 (codex-macos, not vscode/ios) sit adjacent in the sequence but are **not covered by these captures** — do not infer VS Code or iOS behavior from them. Everything below is only what the 29 assigned files show.

---

## 1. Screen-by-screen findings — Codex VS Code Extension (004–024)

### 1.1 First-run onboarding carousel (004–007)

Reached on first open of the Codex panel inside Antigravity IDE. A 4-step wizard renders **inside the docked right-hand "Codex" side panel** (not a separate full-screen modal) while the main editor pane behind it shows the IDE's own empty-state hero ("Antigravity IDE" / "Code with Agent" / ⌘L hint). Panel header throughout: "Codex" title with expand and close (✕) icons.

Each step is: a media block (varies by step) + bold heading + one-line gray body + a persistent **Back / Next** footer, with Back disabled only on step 1.

| Step | Media                                                                                                                          | Heading (verbatim)                         | Body (verbatim)                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1    | Live composer preview: rounded input box, placeholder **"Ask Codex to do anything"**, leading "+" button, circular send button | **Codex in your IDE**                      | "Codex navigates, edits, runs commands, and executes tests directly in your repo. Powered by your ChatGPT account." |
| 2    | Cloud-upload icon + 3 sample task rows (status icon, title, "repo · date", colored +/− diff stats)                             | **Hand off to Codex in the cloud**         | "Send tasks to Codex to run in the background so you can stay focused and move faster."                             |
| 3    | Syntax-highlighted mock code snippet (Mongoose/Node schema) with a highlighted `// TODO: IMPLEMENT SCHEMA` line                | **Turn TODOs into Codex tasks**            | "Write a TODO comment and convert it into a Codex task with a single click."                                        |
| 4    | No media — 3 stacked icon-led disclosure rows instead                                                                          | (no single heading; three rows, see below) | —                                                                                                                   |

Step 4's three rows (icon + bold title + gray subtext, subtext sometimes containing an inline underlined link):

- Mascot-in-hexagon icon — **"Decide how much autonomy you want to grant"** — "For more details, see the _Codex docs_" (linked)
- Circled-i icon — **"Codex can make mistakes"** — "Review the code it writes and commands it runs"
- ChatGPT swirl-logo icon — **"Powered by your ChatGPT account"** — "Uses your plan's rate limits and _training data preferences_" (linked)

Sample cloud-task rows shown in step 2 (realistic placeholder-quality data, useful for our own empty-state mocks): "Explain repository to a new designer" (openai/agi · Oct 12, in progress/spinner), "Fix an onboarding bug" (openai/agi · Oct 9, ✓, +2/−20), "Create a darkmode theme" (openai/codex · Oct 8, ✓, +249/−123).

### 1.2 Model upsell modal (008)

After onboarding, the panel shows its real resting state — a **"Chats"** list (header with history-clock / gear / compose icons; rows: "hi" · 4h, "hi" · 6d, "AGI Workforce Cloud parity — Codex continuation handoff (…" · 3d; footer link "View all (50)") — with a promotional modal layered over the lower two-thirds.

Modal structure: full-bleed gradient hero image (blue/purple abstract swirl) with a close ✕ top-right → bold heading → body paragraph → **two stacked full-width buttons, secondary above primary**.

- Heading: **"Introducing GPT-5.6 Sol"**
- Body: "Our most capable model yet. GPT-5.6 Sol can tackle complex code changes, dig into research, produce polished documents, and take on your most ambitious work. Sol is highly capable at lower reasoning efforts—try starting lower, then turn it up for harder jobs."
- Buttons: **"Continue with current model"** (dark/secondary, on top) then **"Try GPT-5.6 Sol now"** (light/primary, below it)
- Composer model chip visible behind the modal, dimmed: **"5.6 Luna"** — confirms this is a targeted single-model upsell surfaced directly in the composer's own model chip, not a separate settings notification.

### 1.3 Permission confirmation modals — the two required "transcribe exactly" screens (009, 012)

These are triggered from a permission-mode control in the composer (a pill that reads "Full access" / "Approve for me" depending on state — see §1.5). Both modals block the panel (dimmed "Chats" list visible behind).

**Modal A — "Turn on Full Access?" (009)**, triggered turning the composer's permission mode up to unrestricted:

> **⚠ Turn on Full Access?**
>
> Codex will be able to run commands, use the internet, and create and edit files anywhere on this computer without your permission. This includes but is not limited to:

Three icon-led bullet rows in an elevated sub-panel:

| Icon     | Bold title                      | Description                                                             |
| -------- | ------------------------------- | ----------------------------------------------------------------------- |
| Folder   | **Files and folders**           | Read, create, modify, upload, or delete files anywhere on this computer |
| Terminal | **Terminal commands**           | Run commands, install software, and change system settings              |
| Globe    | **Internet and connected apps** | Access websites, send data, and use enabled plugins                     |

Closing line: "This comes with risks like loss or exposure of sensitive data and prompt injection. You can turn this off. _Learn more_" (Learn more = blue link).

Footer: **"Cancel"** (neutral gray) / **"⚠ Confirm"** (red/danger, right-aligned, warning-triangle prefix).

**Modal B — "Use Ultra with Full access?" (012)**, triggered by selecting the "Ultra" reasoning-effort level while Full Access is already on — a compounding-risk confirmation, visually lighter-weight (no bullet list):

> **Use Ultra with Full access?** [✕ close, top-right]
>
> With Ultra and Full access on, Codex can use extended reasoning while running commands, using the internet, and editing files anywhere on your computer without asking. Switch to a more restricted permission mode or use Full access.

Footer: **"⚠ Use Full access"** (red/danger, left) / **"Continue"** (neutral/light, right — the safer default, opposite button order from Modal A).

Observed outcome: the user's next screen (013) shows the composer's permission pill reading **"Approve for me"** rather than "Full access" — i.e. they chose "Continue," which stepped the permission mode _down_ rather than confirming the risky combination. This confirms Full Access and Ultra-reasoning are gated by two independently-triggerable, stackable confirmation dialogs, not one.

### 1.4 Plugins / attach ("+") menu (010)

Opened from the composer's leading "+" button, anchored above the composer as a two-section popup menu (each row: icon + title + one-line gray description):

**Section "Add"**

- Paperclip — **Files and folders**
- Target icon — **Goal** — "Set a goal to keep pursuing"
- Lightbulb — **Plan mode** — "Turn plan mode on"

**Section "Plugins"** (first-party tool plugins, each togglable elsewhere in Settings → Plugins):

- **Documents** — "Create and edit document artifacts"
- **PDF** — "Read, create, and verify PDF files"
- **Spreadsheets** — "Create and edit spreadsheet files"
- **Presentations** — "Create and edit presentations"
- **Template Creator** — "Create or update templates for documents, sp…" (truncated)
- **Sites** — "Build and deploy websites with Sites"
- **Build iOS Apps** — "Build, refine, and debug iOS apps with App Inten…" (truncated)

Composer row at this point: placeholder **"Do anything"**, "+" button, **"Full access"** label in amber with warning icon (confirms the Full Access grant from §1.3 Modal A persisted), model chip **"5.6 Sol"** with lightning-bolt icon, a sparkle icon, circular send button. A small centered mascot glyph in the empty panel body indicates "no active conversation."

### 1.5 Reasoning-effort menu (011)

Opened from the composer's model chip — a narrow popup, distinctly smaller than the "+" menu:

> **Reasoning**
> Light ✓ (checkmark = current selection)
> Medium
> High
> Extra High
> Ultra
> — divider —
> ⚡ GPT-5.6 Sol › (chevron = drills into model sub-picker)
> Speed › (chevron = drills into speed sub-picker)

This is the exact five-level reasoning-effort vocabulary: **Light, Medium, High, Extra High, Ultra**. Confirmed later in Settings → Configuration (§1.7) via a toggle that controls whether "Ultra" appears as the top of a _slider_ rather than in this dropdown list — i.e. reasoning effort has two different picker UIs (dropdown here in the composer, slider option elsewhere) governed by one setting.

### 1.6 Account menu (013)

Opened from a gear/settings icon near the panel's "Chats" header — small dropdown anchored top-right of the panel:

- Muted, non-interactive header row: person icon + **"agiautomationllc@gmail.com"**
- Gear icon — **Personal account**
- Codex mascot icon — **Codex settings**
- Keyboard-shortcut glyph — **Keyboard shortcuts**
- Exit-arrow icon, visually separated as the final item — **Log out**

This is the entry point into the full Settings surface documented next.

### 1.7 Settings — full tab inventory (014–024)

Opening "Codex settings" replaces the panel with a **new full editor tab** titled "Codex Settings" (tab bar shows a single tab, file icon + label + ✕). Layout is two-column: a persistent left icon+label settings-nav rail, and a wide content column — **while the live "Codex" chat side-panel stays docked and visible on the right the entire time**, meaning Settings is not a full-screen takeover; the chat panel is still reachable/usable alongside it.

**Settings nav rail, in order (confirmed identical across every settings screenshot):**

1. **General**
2. **Configuration**
3. **Personalization**
4. **Usage & billing**
5. **MCP servers**
6. **Hooks**
7. **Plugins**
8. **Account** (only nav item with a trailing external-link arrow icon — deep-links out to `https://chatgpt.com/#settings`, gated by a "Configure Trusted Domains / Cancel / Open" confirmation modal, see 024)

#### General (014)

- **Language** — "Language for the app UI" — dropdown, currently **"Auto detect"**
- **Review delivery** — "Start /review in the current chat when possible or launch a separate review chat" — segmented control **Inline** (selected) / Detached
- **Speed** — "Choose how quickly ChatGPT runs across chats, subagents, and compaction" — dropdown, currently **"Fast"**
- Section **"Composer"**:
  - **Show context window usage** — toggle, OFF
  - **Send shortcut** — "Choose when Enter sends a prompt or inserts a new line" — dropdown, currently **"Enter"**
  - **Follow-up behavior** — "Queue follow-ups while Codex runs or steer the current run. Press ⌘⏎ to do the opposite for one message" — segmented control **Queue** (selected) / Steer

#### Configuration (015)

- H1 "Configuration" + subtext "Configure approval policy and sandbox settings _Learn more_"
- Section **"Custom config.toml settings"**: a card titled **config.toml** — "Edit your config to customize agent behavior" / "Restart ChatGPT after editing to apply changes _Docs_" (external-link icon) → button **"Open config.toml"**
- Section **"Model features"**:
  - **Available reasoning efforts** — "Choose which reasoning effort levels appear in model controls. Availability varies by model" — dropdown, currently **"5 selected"** (multi-select)
  - **Ultra in model picker slider** — "Show Ultra as the highest slider option" — toggle, OFF

This is the direct evidence that `config.toml` is a first-class, user-editable file the settings UI merely opens (not replaces) — i.e. our equivalent needs a raw-config escape hatch alongside the GUI toggles.

#### Personalization (016)

- Yellow/olive warning banner (⚠ icon): **"Personality settings are not supported by every model. Codex's tone can be customized in Custom instructions."**
- **Personality** — "Choose a default tone for ChatGPT responses" — dropdown, currently **"Pragmatic"**
- Section header **"Custom instructions"** with a header-right **"Save"** button (disabled while clean) — description "Give ChatGPT extra instructions and context for all chats on this host. _Learn more_" — large resizable textarea, placeholder **"Add your custom instructions…"**
- Section **"Memory"** — description "Configure how ChatGPT collects, retains, and consolidates memories. _Learn more_":
  - **Enable memories** — "Generate new memories from chats and bring them into new chats" — toggle, **OFF**
  - **Allow memory generation from tool-assisted chats** — "Generate memories from chats that used MCP tools or web search" — toggle, **ON** (independently of the row above — confirms these are not parent/child-locked)
  - **Reset memories** — "Delete all ChatGPT memories" — red destructive **"Reset"** button

#### Usage & billing (017)

- Subtext: "To view invoices, change your payment method, and take other actions, visit _settings_ on Web" (deep-links to web settings — billing management is NOT duplicated natively here)
- **"Your plan"**: **Pro plan** + button **"View plans"**
- **"Credits balance"** — "Your remaining credits": **$0** / "Current balance" + button **"Buy credits"**
- **"General usage limits"**: "Weekly usage limit" / "Resets Jul 28" — horizontal progress bar + **"100% left"**
- **"GPT-5.3-Codex-Spark usage limits"**: identical structure, own separate weekly meter, also "100% left" resetting "Jul 28" — confirms **per-model usage quotas exist alongside a general quota**
- **"Usage limit resets"** section begins at the bottom, showing **"No resets available"** (empty state, per corpus notes)

#### MCP servers (018–019)

- H1 + subtext "Connect external tools and data sources"
- Four-way filter/tab pill row shared with the Plugins tab: **Plugins 22 · Apps 7 · MCPs 9 · Skills 45**, with "MCPs" selected
- Section **"Servers"** + right-aligned **"+ Add server"** button
- Nine server rows, each with a name, gear/settings icon, and toggle: **computer-use** (OFF — the only one off), **context7**, **github**, **memory**, **node_repl**, **openaiDeveloperDocs**, **playwright**, **sequential-thinking**, **stripe** (all ON)
- Scrolled further (019): a second, distinct section **"From plugins"** listing four servers with **no gear icon and no toggle** — read-only/derived entries owned by an installed plugin rather than directly configurable: **codex_apps**, **openai-api-key-local-confirmation**, **sites-design-picker**, **xcodebuildmcp**

#### Hooks (020)

- H1 "Hooks" with a small circular refresh icon at the far right of the heading row
- Subtext: "Manage lifecycle hooks from config and enabled plugins. _Learn more_"
- Single empty-state card: **"No hooks found"** (bold) / **"Configured hooks will appear here"** (gray)
- No other content — a genuinely empty, zero-configured-hooks state in this capture.

#### Plugins (021–023) — 3 screenshots, one continuous scroll

- H1 "Plugins" + subtext "Manage plugins, skills, and MCPs"
- Same four-way tab row as MCP servers, now with **"Plugins 22"** selected
- One continuous list, each row: colored icon tile + bold name + gray description + trailing control. **Trailing control changes partway down the list** — first-party/user-toggleable plugins get a **toggle switch**; third-party/system-provided integrations get a static **gray checkmark** instead (no toggle) — two visually distinct "enabled" states in one list.

Full transcribed catalog, in order, with trailing-control type:

| Name                                                    | Description                                                                                     | Control                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------- |
| Documents                                               | Create and edit document artifacts                                                              | toggle (ON)                  |
| PDF                                                     | Read, create, and verify PDF files                                                              | toggle (ON)                  |
| Spreadsheets                                            | Create and edit spreadsheet files                                                               | toggle (ON)                  |
| Presentations                                           | Create and edit presentations                                                                   | toggle (ON)                  |
| Template Creator                                        | Create or update templates for documents, spreadsheets, and presentations                       | toggle (ON)                  |
| Sites                                                   | Build and deploy websites with Sites                                                            | toggle (ON)                  |
| Browser _(suffixed "Unavailable in this context")_      | Control the in-app browser with ChatGPT                                                         | toggle (ON, but unavailable) |
| Chrome                                                  | Control Chrome with ChatGPT                                                                     | toggle (ON)                  |
| Computer Use _(suffixed "Unavailable in this context")_ | Control Mac apps from ChatGPT                                                                   | toggle (ON, but unavailable) |
| Visualize                                               | Turn ideas and data into interactive visuals                                                    | toggle (ON)                  |
| GitHub                                                  | Triage PRs, issues, CI, and publish flows                                                       | checkmark                    |
| Sales                                                   | Practical workflows for sellers                                                                 | checkmark                    |
| Google Drive                                            | Work across Drive, Docs, Sheets, and Slides                                                     | checkmark                    |
| OpenAI Developers                                       | Develop AI apps, agents, and ChatGPT Apps with OpenAI best practices                            | checkmark                    |
| Vercel                                                  | Search docs and deploy apps                                                                     | checkmark                    |
| Build iOS Apps                                          | Build, refine, and debug iOS apps with App Intents, SwiftUI, and Xcode workflows                | checkmark                    |
| Build macOS Apps                                        | Build, debug, instrument, and implement macOS apps with SwiftUI and AppKit guidance             | checkmark                    |
| Build MCP Apps                                          | Build and deploy MCP apps                                                                       | checkmark                    |
| Build Web Apps                                          | Build frontend-focused web apps with generated assets, browser testing, payments, and databases | checkmark                    |
| Codex Browser Recorder                                  | Record Chrome flows as MP4                                                                      | checkmark                    |
| Default templates                                       | Default templates for documents, spreadsheets, and presentations                                | checkmark                    |
| Expo                                                    | Build, deploy, upgrade, and debug Expo and React Native apps                                    | checkmark                    |

Note "Unavailable in this context" is communicated as **inline gray text next to the plugin title**, while the toggle itself stays ON — "enabled" and "currently usable on this host" are tracked as two separate booleans, not one.

#### External-navigation confirm modal (024)

Triggered by clicking the "Account" nav item (its external-link icon), over the dimmed, scrolled Plugins list:

> ⓘ **Do you want Antigravity IDE to open the external website?**
> `https://chatgpt.com/#settings`

Buttons: **"Configure Trusted Domains"** / **"Cancel"** / **"Open"** (primary, blue-highlighted with focus ring). A ✕ close icon sits top-right of the modal, equivalent to Cancel. This confirms Codex's own Settings "Account" tab is not a native page at all — it is a deep link out to the web app's settings, gated by a trusted-domain confirmation the host IDE owns.

---

## 2. Screen-by-screen findings — Codex iOS Remote Control (027–030, 037–039, 058)

This is **not** a full native Codex chat client on iOS — every screen in this set is specifically the **"Codex Remote"** flow: pairing an iPhone to an already-running Codex Desktop (macOS) session so the phone becomes a thin remote control / project browser, never doing local agent work itself.

### 2.1 Remote setup — intro (027)

Full-screen modal, light theme, soft purple/blue gradient hero fading to white in the top ~35%, circular gray "✕" top-left (dismiss). Centered white rounded-square app-icon tile (purple/blue gradient bubble with a white `>_` terminal glyph — the Codex mark).

- Heading: **"Set up Codex"**
- Subheading: **"An AI agent that helps you build and understand anything."**
- Three instructional rows (icon + paragraph, no interaction):
  1. Monitor icon — "Codex uses the power of your desktop computer to build software and do complex work."
  2. ChatGPT swirl icon — "Sign into the Codex desktop app with your ChatGPT account (siddharthanagula3@gmail.com)."
  3. Two-panel/sidebar icon — "In the Codex desktop sidebar, click "Set up remote control" to get your pairing code."
- Primary button (black pill): **"I'm signed in on desktop"**
- Secondary button (outline pill): **"Email me a download link"**

No progress dots/step indicator anywhere in this flow.

### 2.2 Remote setup — get pairing code (028)

Top-left control is now a back-chevron (not ✕) — confirms forward progress in a linear flow. Large centered black-outline monitor icon replaces the app-icon tile.

- Heading: **"Get pairing code"**
- Body: "Make sure the Codex desktop app is set to the same workspace as this device." / "In the Codex desktop app sidebar, click "Set up remote control" to get your pairing code."
- Single full-width black CTA: **"I have a pairing code"**

### 2.3 Remote setup — QR scanner (029)

Back-chevron persists top-left. A small **green camera-active dot** appears next to the status-bar signal icons, confirming a live camera feed. Centered rounded-square viewfinder shows the live (dark) camera preview with four yellow/gold L-shaped corner brackets marking the scan target.

- Caption: **"Scan QR code to pair"**
- Fallback button (outline pill): **"Pair manually instead"**

### 2.4 Remote setup — manual pairing modal (030)

The QR-scanner screen stays visible but dimmed behind a centered, vibrancy-style native alert sheet, with the full iOS QWERTY keyboard docked at the bottom.

> **Pair manually**
> Enter the pairing code shown on your desktop.
> [ Pairing code ] ← empty text field, cursor active
> **Cancel** **Pair** (visually muted/disabled — empty field)

This is a native-style two-button alert with an embedded text field, not a custom full-screen page — the primary "Pair" action is disabled until the field is non-empty.

### 2.5 OAuth consent — system dialog + webview (037; the native OS dialog itself is 036, outside this assigned set but referenced for continuity)

037 is the **in-app browser (SFSafariViewController-style)** page that loads at `auth.openai.com` after the native iOS system consent alert is accepted. Top bar: circular "✕" close (left), title **"auth.openai.com"** with a thin blue loading-progress bar beneath it, circular page-options icon (right). A native bottom toolbar (back-chevron, share/export, ✕ close) sits below the page content, separate from the page's own buttons.

Page content:

- Heading: **"Confirm this is the ChatGPT account you want to use with Codex Remote."**
- Account chip: person-in-circle icon + **"agiautomationllc@gmail.com"**
- Body: "By continuing, you authorize Codex on this device to access and control remote devices linked to your ChatGPT account. Proceed only if you initiated this request and trust this device."
- Buttons: **"Cancel"** (outline) / **"Authorize"** (solid black, primary)
- Footer links: **"Terms of Use"** | **"Privacy Policy"**

Note the exact phrase **"control remote devices"** — the consent text itself names the capability being granted as device control, not merely chat sync.

### 2.6 Remote project list (038)

The "Remote" landing screen — reached after successful pairing/authorization. Standard iOS top app bar: leading hamburger (circular), centered two-line header, trailing circular "•••" overflow.

- Header title: **"Remote"**
- Header subtitle: laptop icon + **green status dot** + **"Siddharthas-MacBook-Air-2.local"** — live online/connected indicator for the paired Mac
- Section header: **"Projects"**
- Project rows (folder icon + name + "›" chevron + separate trailing edit/pencil-in-box icon): **agiworkforce, siddhartha, hermes-agent, claw-code, openclaw, opencode, codex-cli, gemini-cli, src** — nine rows, each independently drill-in-able _and_ independently editable (two separate tap targets per row)
- Bottom bar: search field **"Search Chats"** (magnifying-glass icon) + black pill button **"Chat"** (compose icon)

This confirms the remote surface is scoped to **project folders that already exist on the paired Mac's filesystem** — it is a live window into desktop-side project state, not an independent mobile workspace.

### 2.7 Remote project list — overflow menu (039)

Same base screen, dimmed, with a rounded popover anchored to the "•••" button, divided into three labeled groups by thin dividers:

**Organize**

- ✓ **By project** (current selection, checkmark)
- **Chronological list**
- **Chats first**

**Manage**

- **Cloud tasks**
- **Archived tasks**
- **Add connection**
- **Settings** (→ leads to the Remote control settings screen, §2.8)

**Usage remaining**

- **Week 100%** (plain static text row, no icon, no chevron — a read-only quota readout embedded directly in this menu rather than requiring a trip to Settings)

### 2.8 Remote control settings (058)

Standard iOS settings-sheet shell — status bar, circular back-chevron, centered bold title **"Remote control"** — confirming the same design system as the main ChatGPT iOS app's settings screens (grouped white cards on light-gray background).

- **Profile** card: circular avatar "SN" + label "Profile" + chevron (drills to a deeper profile screen)
- Section **"Connections"** with trailing blue **"Disconnect All"** link (a section-level bulk action, not per-row):
  - Device row: laptop icon, small gray label **"Codex Desktop"**, bold title **"Siddharthas-MacBook-Air-2.l…"** (truncated), green dot + **"Connected"**, trailing toggle **ON**
  - **"+ Add connection"** blue link row
- Section **"Composer"**:
  - **Show context window usage** — toggle, **OFF**
  - **Follow-up behavior** — value **"Queue"** with an up/down chevron (a stepper-style picker, distinct from a disclosure-chevron nav row)
- Section **"Behavior"**:
  - **Wrap code diff lines** — toggle, **ON**
- Section **"Safety and security"**:
  - **Require Face ID** — toggle, **ON** — helper text below the card: "Require Face ID or passcode to access Codex on this device."

Notably, "Show context window usage" and "Follow-up behavior: Queue" **exactly mirror** the VS Code extension's General settings (§1.7 General) — same labels, same default values — strong evidence these read/write the same underlying per-user preference record across the desktop/IDE and the mobile-remote surface, not two separately-implemented settings stores.

---

## 3. Reconstructed navigation trees

### 3.1 Codex VS Code Extension — full tree (as observed)

```
Codex panel (docked right side-panel in Antigravity IDE)
├── First-run onboarding (4-step carousel, shown once)
│   ├── Step 1: composer preview ("Ask Codex to do anything")
│   ├── Step 2: cloud task-handoff sample list
│   ├── Step 3: TODO→task code-snippet demo
│   └── Step 4: autonomy / mistakes / ChatGPT-account disclosure rows
├── Chats (default resting view)
│   ├── Chat list rows (title, relative time)
│   ├── "View all (N)" → full chat history
│   ├── [promotional] Model upsell modal (dismissible, one-time per model release)
│   └── Composer
│       ├── "+" attach/plugins menu
│       │   ├── Add: Files and folders / Goal / Plan mode
│       │   └── Plugins: Documents / PDF / Spreadsheets / Presentations /
│       │       Template Creator / Sites / Build iOS Apps (+more, see §1.7 Plugins)
│       ├── Permission-mode pill (default → amber "Full access" → neutral "Approve for me")
│       │   ├── "Turn on Full Access?" confirm modal
│       │   └── "Use Ultra with Full access?" confirm modal (compounding-risk)
│       ├── Reasoning-effort menu (Light/Medium/High/Extra High/Ultra)
│       │   ├── → Model sub-picker (chevron drill-in)
│       │   └── → Speed sub-picker (chevron drill-in)
│       └── Send button
├── Account menu (gear icon near "Chats" header)
│   ├── [identity row, non-interactive] email
│   ├── Personal account
│   ├── Codex settings → opens Settings as a new editor tab
│   ├── Keyboard shortcuts
│   └── Log out
└── Codex Settings (full editor tab; chat side-panel stays docked alongside)
    ├── General
    │   ├── Language, Review delivery, Speed
    │   └── Composer: context-window toggle, Send shortcut, Follow-up behavior
    ├── Configuration
    │   ├── Custom config.toml settings → "Open config.toml"
    │   └── Model features: Available reasoning efforts (multi-select), Ultra-in-slider toggle
    ├── Personalization
    │   ├── [warning banner]
    │   ├── Personality dropdown
    │   ├── Custom instructions (textarea + Save)
    │   └── Memory: Enable memories, Allow memory from tool-assisted chats, Reset memories
    ├── Usage & billing
    │   ├── Your plan → View plans
    │   ├── Credits balance → Buy credits
    │   ├── General usage limits (weekly meter)
    │   ├── [Per-model] usage limits (weekly meter, e.g. GPT-5.3-Codex-Spark)
    │   └── Usage limit resets
    ├── MCP servers
    │   ├── Tabs: Plugins / Apps / MCPs / Skills (shared with Plugins tab)
    │   ├── Servers (name + gear + toggle) + "+ Add server"
    │   └── From plugins (name only, read-only, plugin-derived)
    ├── Hooks
    │   └── Empty state: "No hooks found"
    ├── Plugins
    │   ├── Tabs: Plugins / Apps / MCPs / Skills
    │   └── Catalog list (toggle-controlled first-party plugins, then checkmark-only
    │       system/third-party integrations — one continuous scroll)
    └── Account (external-link icon)
        └── → deep-link to chatgpt.com/#settings, gated by
            "open external website?" confirm modal (Configure Trusted Domains / Cancel / Open)
```

### 3.2 Codex iOS Remote Control — full tree (as observed)

```
ChatGPT iOS app → Codex tab
└── Codex Remote setup (first run)
    ├── Intro screen: "Set up Codex" (3 instructional rows)
    │   ├── "I'm signed in on desktop" → Get pairing code
    │   └── "Email me a download link"
    ├── Get pairing code (instructional, back-chevron nav)
    │   └── "I have a pairing code" → QR scanner
    ├── QR code scanner (live camera, corner-bracket viewfinder)
    │   └── "Pair manually instead" → manual pairing modal
    ├── Manual pairing modal (native alert + text field)
    │   ├── Cancel
    │   └── Pair (disabled until code entered)
    ├── [native iOS system consent alert — "ChatGPT" wants to use "auth.openai.com"]
    └── OAuth consent webview (auth.openai.com, in-app browser)
        ├── Account confirmation chip (single pre-selected account)
        ├── Cancel
        └── Authorize → Remote project list

Remote project list ("Remote" tab, top-level)
├── Header: connected-device subtitle (green dot + hostname)
├── Projects (folder rows: name + drill-in chevron + separate edit icon)
├── Search Chats (bottom bar)
├── "Chat" primary action (bottom bar)
└── "•••" overflow menu
    ├── Organize: By project (✓) / Chronological list / Chats first
    ├── Manage: Cloud tasks / Archived tasks / Add connection / Settings
    └── Usage remaining: Week N% (static readout)

Remote control settings (Settings entry from overflow menu)
├── Profile (avatar + chevron)
├── Connections — "Disconnect All"
│   ├── Paired-device row (name, live Connected status, toggle)
│   └── "+ Add connection"
├── Composer
│   ├── Show context window usage (toggle)
│   └── Follow-up behavior (Queue/Steer stepper)
├── Behavior
│   └── Wrap code diff lines (toggle)
└── Safety and security
    └── Require Face ID (toggle) + helper text
```

---

## 4. Control inventory table

| Screen                      | Control                                                          | Type                                | What it appears to do                                                                                         |
| --------------------------- | ---------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Onboarding step 1–4         | Back / Next                                                      | Buttons                             | Step navigation; Back disabled on step 1 only                                                                 |
| Onboarding step 4           | "Codex docs" / "training data preferences"                       | Inline text links                   | Open external docs                                                                                            |
| Model upsell modal          | ✕ close                                                          | Icon button                         | Dismiss modal without changing model                                                                          |
| Model upsell modal          | "Continue with current model"                                    | Secondary button                    | Keep current model, dismiss                                                                                   |
| Model upsell modal          | "Try GPT-5.6 Sol now"                                            | Primary button                      | Switch active model (confirmed persisted in later screens)                                                    |
| Full-Access modal           | Cancel / Confirm                                                 | Button pair                         | Cancel = no-op; Confirm (red) = grant full unattended file/terminal/internet access                           |
| Ultra+Full-Access modal     | "Use Full access" / "Continue"                                   | Button pair                         | Use Full access (red) = confirm risky combo; Continue = step down to safer mode                               |
| "+" attach menu             | Files and folders / Goal / Plan mode                             | Menu rows                           | Add context / set persistent goal / toggle plan mode                                                          |
| "+" attach menu             | Plugin rows (Documents, PDF, …)                                  | Menu rows                           | Enable/insert that plugin's capability into the current chat                                                  |
| Reasoning menu              | Light/Medium/High/Extra High/Ultra                               | Single-select list                  | Set per-chat reasoning effort; checkmark on active                                                            |
| Reasoning menu              | Model row / Speed row                                            | Drill-in rows (chevron)             | Open nested model picker / speed picker                                                                       |
| Composer                    | Permission-mode pill                                             | Multi-state chip                    | Cycles default → "Full access" (amber) → "Approve for me" (neutral); each escalation gated by a confirm modal |
| Account menu                | Personal account / Codex settings / Keyboard shortcuts / Log out | Menu rows                           | Navigate to sub-screens / sign out                                                                            |
| Settings → General          | Language                                                         | Dropdown                            | UI locale, "Auto detect" default                                                                              |
| Settings → General          | Review delivery                                                  | Segmented control (Inline/Detached) | Where `/review` runs                                                                                          |
| Settings → General          | Speed                                                            | Dropdown                            | Global response-speed tier ("Fast" default)                                                                   |
| Settings → General          | Show context window usage                                        | Toggle                              | Show/hide token-budget indicator in composer                                                                  |
| Settings → General          | Send shortcut                                                    | Dropdown                            | Enter-key behavior                                                                                            |
| Settings → General          | Follow-up behavior                                               | Segmented control (Queue/Steer)     | Queue vs. interrupt-and-redirect running agent                                                                |
| Settings → Configuration    | "Open config.toml"                                               | Button                              | Opens raw config file in editor                                                                               |
| Settings → Configuration    | Available reasoning efforts                                      | Multi-select dropdown               | Which effort levels appear in model controls                                                                  |
| Settings → Configuration    | Ultra in model picker slider                                     | Toggle                              | Show Ultra as slider max vs. dropdown-only                                                                    |
| Settings → Personalization  | Personality                                                      | Dropdown                            | Default response tone ("Pragmatic")                                                                           |
| Settings → Personalization  | Custom instructions textarea + Save                              | Textarea + button                   | Free-text global instructions; Save enables only when dirty                                                   |
| Settings → Personalization  | Enable memories                                                  | Toggle                              | Master memory generation switch                                                                               |
| Settings → Personalization  | Allow memory generation from tool-assisted chats                 | Toggle                              | Independent sub-switch (can be ON while master is OFF)                                                        |
| Settings → Personalization  | Reset                                                            | Destructive button                  | Deletes all memories                                                                                          |
| Settings → Billing          | View plans / Buy credits                                         | Buttons                             | Deep-link to plan/credit purchase                                                                             |
| Settings → Billing          | Weekly usage limit (general + per-model)                         | Progress bar + %                    | Quota consumption meters, separately scoped                                                                   |
| Settings → MCP servers      | Plugins/Apps/MCPs/Skills tabs                                    | Count-badged tab row                | Filters the same underlying catalog by category                                                               |
| Settings → MCP servers      | Per-server gear + toggle                                         | Icon + toggle                       | Configure / enable-disable a manually-added server                                                            |
| Settings → MCP servers      | "From plugins" rows                                              | Static list rows (no control)       | Read-only servers auto-registered by installed plugins                                                        |
| Settings → Hooks            | (empty state)                                                    | —                                   | "No hooks found" / "Configured hooks will appear here"                                                        |
| Settings → Plugins          | Per-plugin toggle                                                | Toggle                              | Enable/disable a first-party plugin (independent of "available in this context")                              |
| Settings → Plugins          | Per-integration checkmark                                        | Static icon                         | Marks a system/third-party integration as always-on/included                                                  |
| Settings → Account          | External-link row                                                | Nav row                             | Triggers "open external website?" confirm modal before leaving the IDE                                        |
| iOS remote setup intro      | "I'm signed in on desktop" / "Email me a download link"          | Button pair                         | Advance flow / send install link                                                                              |
| iOS pairing (QR)            | Camera viewfinder                                                | Live scanner                        | Auto-pairs on successful QR read                                                                              |
| iOS pairing (QR)            | "Pair manually instead"                                          | Button                              | Falls back to manual-code modal                                                                               |
| iOS manual pairing modal    | Pairing code field + Cancel/Pair                                 | Text field + buttons                | Pair disabled until code entered                                                                              |
| iOS OAuth webview           | Account chip                                                     | Static chip                         | Shows the single pre-authorized account, no switcher visible                                                  |
| iOS OAuth webview           | Cancel / Authorize                                               | Button pair                         | Grant/deny remote-control authorization                                                                       |
| iOS Remote project list     | Project row + separate edit icon                                 | List row w/ 2 tap targets           | Open project OR rename/manage it, independently                                                               |
| iOS Remote project list     | "•••" overflow                                                   | Icon button                         | Opens Organize/Manage/Usage popover                                                                           |
| iOS Remote overflow         | By project / Chronological / Chats first                         | Single-select rows                  | Changes list grouping                                                                                         |
| iOS Remote overflow         | Week N%                                                          | Static text row                     | Read-only usage readout, no icon                                                                              |
| iOS Remote control settings | Paired-device toggle                                             | Toggle                              | Enable/disable that specific connection without fully disconnecting                                           |
| iOS Remote control settings | Disconnect All                                                   | Text link                           | Bulk-revokes all paired connections                                                                           |
| iOS Remote control settings | Follow-up behavior                                               | Stepper-style value row (⌄⌃)        | Same Queue/Steer setting as desktop, mirrored here                                                            |
| iOS Remote control settings | Require Face ID                                                  | Toggle                              | Biometric app-lock scoped to Codex specifically (not the whole ChatGPT app)                                   |

---

## 5. Notable design decisions

- **The Settings surface is a full editor tab, not a modal, and never hides the live chat panel.** Opening "Codex settings" from the account menu opens a _new tab_ in the main editor area while the docked chat side-panel stays visible and usable on the right the entire time — settings and an active conversation are never mutually exclusive states in this product.
- **Permission is a tri-state chip, not a boolean, and every escalation is individually confirmed.** Default → "Full access" (amber) → "Approve for me" (neutral) is one control with two independent confirm-modal gates (Full Access itself, and Ultra+Full-Access as a compounding-risk combination) rather than a single "are you sure" dialog. The two dialogs use **opposite button ordering** for their dangerous action (danger-button on the right in modal A, on the left in modal B) — worth normalizing in our own version rather than copying verbatim.
- **"Enabled" and "usable-right-now" are tracked as two separate states.** Plugins like Browser and Computer Use show their toggle ON while simultaneously displaying "Unavailable in this context" as inline text — the product doesn't force-disable a toggle just because the current host can't act on it.
- **Two different trailing-control types share one list-row component.** The Plugins catalog silently switches from live toggles (first-party plugins) to static checkmarks (system/third-party integrations) partway down one continuous scrollable list, with no section break — implying a single row component with a swappable trailing-control slot rather than two components.
- **A raw-config escape hatch coexists with the GUI.** Settings → Configuration exposes "Open config.toml" as a first-class action next to the equivalent GUI toggles (reasoning-effort multi-select, Ultra-slider toggle) — power users are not forced to choose between file-based and UI-based configuration.
- **Reasoning effort has two independent surfaces that must stay in sync**: a composer dropdown (Light/Medium/High/Extra High/Ultra, single-select with checkmark) and a settings-level multi-select ("Available reasoning efforts," "5 selected") that controls which of those five even _appear_ in the dropdown, plus a further toggle for whether "Ultra" shows as a slider-max instead. Three linked but distinct controls for one concept.
- **The mobile "Remote" surface deliberately does zero local agent work.** Every iOS screen in this set is either pairing infrastructure or a thin browser/control layer over a desktop session — project rows literally mirror the paired Mac's folder structure, and settings mirrored between iOS Remote and the VS Code extension (context-window toggle, Follow-up behavior default "Queue") strongly suggest one shared preferences record rather than two independently-built settings stores.
- **Device-level toggle vs. account-level "Disconnect All."** The Remote control settings screen gives a per-connection toggle for fine control alongside a section-level bulk "Disconnect All" link — two different granularities of the same underlying action, both surfaced on one screen.
- **Face ID lock is scoped per-feature, not global.** "Require Face ID" here is specific to the Codex Remote surface ("access Codex on this device"), separate from any account-wide biometric lock — a user could in principle require Face ID for Codex without requiring it for the rest of ChatGPT (per the adjacent corpus evidence in image 059, not in this assigned set but referenced by the guide's cross-cutting analysis).
- **The permission grant covers "anywhere on this computer," not workspace-scoped.** The Full Access warning copy is explicit that file/terminal/internet access is unattended and unrestricted to the current repo — a materially higher-risk grant than a workspace-trust model, worth flagging for our own permission-model design.

---

## 6. Capabilities visible here that web documentation would not tell you

- **The exact escalation path from "ask every time" to "never ask" is two separate, stacked confirmations**, not a single toggle — this sequencing (and the specific warning copy: "loss or exposure of sensitive data and prompt injection") is only visible by actually triggering the flow, not from any public docs page.
- **The precise wording used to describe unattended agent risk** ("Codex will be able to run commands, use the internet, and create and edit files anywhere on this computer without your permission...This comes with risks like loss or exposure of sensitive data and prompt injection") is verbatim, load-bearing legal/trust copy that should inform our own permission-modal language rather than being reinvented.
- **Per-model usage-limit metering is a real, separately-tracked billing dimension** (general weekly limit _and_ a distinct "GPT-5.3-Codex-Spark usage limits" meter shown simultaneously) — evidence of backend usage-metering granularity down to specific model/variant, not just plan tier.
- **MCP servers can be either user-managed or plugin-derived, and the UI visually distinguishes the two** (toggle+gear vs. name-only) — implies the backend tracks provenance (user-added vs. installed-by-plugin) per MCP server entry, a data-model detail no marketing page would surface.
- **Settings → Account is not a native settings page at all** — it's a deep link out to the web app gated by a general-purpose "open external website?" trust-domain confirmation the _host IDE_ owns (not Codex-specific chrome) — meaning account management was deliberately NOT reimplemented natively inside the extension, and the extension relies on the host editor's own external-link trust system.
- **The mobile remote-pairing OAuth consent copy explicitly names "control remote devices"** as the authorized capability (not just "sync" or "view") — confirming the mobile app is granted actual control-plane authority over the paired desktop, which has real security-review implications for building an equivalent (this is more powerful than a read-only companion app).
- **Two-tap-target project rows** (separate open vs. edit icon per row) on the iOS remote list is a small but real interaction-density detail: mobile still supports inline rename/manage without opening the project first, something a feature list or docs page would likely omit.
- **The Follow-up behavior default ("Queue") and the context-window-usage toggle default (OFF) are identical between the VS Code extension and the iOS Remote settings screen** — only visible by comparing two screenshots side by side, and it's the strongest evidence in this set that preferences sync across a shared backend rather than being platform-local defaults that happen to match.
- **A model-upsell modal is live promotional infrastructure embedded directly in the chat panel**, not a separate notification/banner system — it renders inside the same panel as the chat list, overlapping it, and is dismissible per-session; worth noting as a pattern (in-context feature announcement over a blocking full-screen takeover) rather than assuming from docs that new-model announcements are out-of-band emails or changelogs.

---

## 7. Summary of `ChatGPT_Codex_UI_Reference_and_Build_Guide.md`

This 3,339-line companion document (in the same directory, read in full) is the source corpus this assignment's screenshots were drawn from. Its own scope is much larger than this assignment (155 images across ChatGPT iOS/web/macOS and Codex iOS/macOS/vscode-ext/web-extension); only the parts relevant to this assignment are summarized here.

**Structure:** (1) corpus overview + naming convention, (2) a 155-row screen index, (3) full per-screen documentation (Overview / Layout & structure / Visible elements verbatim / Interactive components & state / Data shown / Reusable component notes) for every image, (4) **Section 5, cross-cutting UI/UX patterns** synthesized across the whole corpus, (5) **Section 6, a technical architecture & build guide**, (6) a full original-filename → renamed-filename manifest.

**Corpus facts relevant to this set:** total 155 screens; Codex·vscode-ext accounts for 21 of them (all covered in this assignment, seq 004–024) and Codex·iOS accounts for 8 (all covered in this assignment, seq 027–030/037–039/058, reached via "Codex Remote" pairing inside the ChatGPT app). Capture window: three images ~46 days prior, then 152 images in one continuous walkthrough on **2026-07-21, 8:08 PM–11:11 PM**. This assignment's images fall at 8:08–8:12 PM (vscode-ext) and 9:12–9:21 PM (iOS remote).

**Section 5 (cross-cutting patterns)** most relevant to this set:

- One account/settings shell powers both ChatGPT and Codex brands; Codex's own Billing pane states "your subscription is managed through ChatGPT," and Codex-branded screens contain literal "ChatGPT" copy (e.g. this set's own "Powered by your ChatGPT account" onboarding row, and the "Use your Mac apps while locked... Learn more" language noted elsewhere in the corpus).
- The permission/consent system (Full Access / Ultra tri-state) is characterized as "one shared state machine, not a per-feature control" — consistent with what this document's §1.3/§1.5 show directly.
- Device pairing (QR tab / manual-code tab) is "one reusable flow, reused for two purposes" — both Codex Remote (this set) and ordinary new-device account authorization elsewhere in the corpus.
- Settings render through three different shell components depending on platform (full-page nav-rail on macOS/vscode-ext, modal-with-rail on web, native grouped list on iOS) but are argued to share one underlying declarative schema.
- The IDE-embedded chat panel (this set) and the standalone macOS Codex app are argued to be "the same web bundle in two hosts," given pixel-identical composer/permission-pill/model-picker/settings-shell components.

**Section 6 (build guide)** key recommendations bearing on this assignment's surfaces:

- Treat five client surfaces (web, iOS, macOS desktop, VS Code extension, browser extension) as skins over one shared account/settings/billing/conversation/permission backend, not five independent builds.
- VS Code extension recommended stack: TypeScript `vscode` extension API hosting a Webview that loads the _same_ chat bundle as web/desktop, talking to the local agent runtime over stdio/JSON-RPC.
- iOS recommended stack: native SwiftUI + Combine/async-await (the corpus's native modals, Face ID sheet, and system OAuth consent dialog are cited as evidence this is a genuinely native app, not a WebView wrapper).
- Device pairing / remote control is called out as the correct **last** build-order item ("build last; it depends on every other surface already being stable, since its entire job is letting one surface [iOS] drive another [macOS] that must already work standalone").
- The permission tri-state, the settings schema→renderer split, and the device-pairing flow are each named as "key state machines worth designing once, deliberately, before writing UI for them" — directly validated by what this document's own screen-by-screen findings show.

No section of the guide claims release/beta status for the vscode-ext or iOS-remote surfaces; both are treated as shipped, ordinary product surfaces at capture time.
