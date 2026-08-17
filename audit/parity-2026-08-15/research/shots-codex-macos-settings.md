# OpenAI Codex — macOS Desktop App: Settings Tree (Screenshot Evidence)

## Scope and provenance

This document covers every screenshot in the corpus matching `codex-macos-settings-*` and `codex-macos-keyboard-*`, all located in `/Users/siddhartha/Desktop/chatgpt_reference/`. 37 image files were found and every one was opened and visually inspected with the Read tool. No screen described below is inferred from a filename alone.

**Caveats (read before using this as a spec):**

- These are point-in-time captures of unknown exact date/build. The app reports an internal version string "26.715.12143..." (partially cut off) on the Configuration screen — treat this as evidence of a specific build, not a stable version identifier to cite elsewhere.
- The account shown is a real Pro-plan account (`@agiautomationllc`, Pro, $200/mo plan) — dollar figures, token counts, and usage numbers are this account's live data, not universal defaults.
- Several features carry their own in-product experimental/risk labels — **"Chronicle research preview"** (Personalization → Memory) is explicitly marked as a research preview, and the built-in browser and Chrome-extension "Enable full CDP access" toggles are explicitly labeled "Elevated risk" in orange. Treat both as beta/edge surfaces, not stable baseline behavior.
- One usage-limit section is labeled **"GPT-5.3-Codex-Spark usage limits"** on the Billing screen. This is transcribed verbatim as it appeared on screen; it is unusual-looking model naming and should be independently verified against a model catalog before being treated as a real, current model ID anywhere else — it is reported here purely as literal screenshot evidence, not as a confirmed model identifier.
- The Configuration screen's "Available reasoning efforts" dropdown was seen closed ("5 selected"); the actual five effort-level option strings inside that dropdown were not opened/visible in this capture set — flagged as **not covered**.
- The General settings screen (092) was captured mid-scroll — the top of that page (above "Imported agent setup") is **not covered** by this capture set.
- The keyboard-shortcuts list appears to continue past the last visible row on the final screen (108, ending at "Start Trace Recording"); there may be additional rows below that were **not captured**.
- No screens in this set showed the open state of the "Approval policy" or "Sandbox settings" dropdown menus on the Configuration screen — only their currently-selected values ("On request" and "Workspace write") were visible. The full option lists were **not covered**.

---

## Full settings navigation tree (left sidebar, identical across all 37 screens)

```
← Back to app
[ Search settings... ]

Personal
├── General
├── Profile
├── Appearance
├── Voice
├── Configuration
├── Personalization
├── Pets
├── Keyboard shortcuts
├── Usage & billing
└── Account  (↗ external link icon — leaves the app)

Integrations
├── Appshots
├── Plugins
├── Browser
│   └── (drill-down) Computer use → Google Chrome  [breadcrumb sub-page]
└── Computer use

Coding
├── Hooks
├── Connections
│   ├── Control this Mac   (tab)
│   ├── Control other devices   (tab)
│   └── SSH   (tab)
├── Git
├── Environments
└── Worktrees

Archived
└── Archived chats
```

The sidebar is grouped into four labeled sections (Personal / Integrations / Coding / Archived) with no collapse/expand affordance visible — all items always rendered. A live "Search settings…" box at the top filters _into_ the tree: typing "remo" surfaces not just the "Connections" top-level item but nested action-level labels from other pages (e.g., "Remote control" under Connections, "Remove" under Browser and under Computer use, "Voice" under Voice, "Reduce motion" under Appearance, "Personalization" under Personalization, "The legacy WSL agent environment…" under General, "Recommended for most users. Turn…" under Worktrees). This shows the settings search index operates over full setting _body text_, not just the section titles — every toggle's description text is a search hit target, and each result item is a live sidebar shortcut, not a separate results page.

---

## Screen-by-screen inventory

### 1. Connections → Control this Mac — Allow toggle (empty state)

`032-codex-macos-settings-connections-control-this-mac-allow-toggle.png`

- Tabs: **Control this Mac** (active) / Control other devices / SSH
- "Devices that can control this Mac" panel (refresh icon, top right)
  - **Allow connections** toggle — ON
  - Empty-state block inside the panel: phone↔laptop pairing glyph, copy "Add device to control this Mac remotely", **Add** button (white pill)
- "Other settings"
  - **Keep this Mac awake** toggle — ON — "Prevent sleep when computer is plugged in and remote access is enabled"

### 2. Connections → MFA-required modal

`033-codex-macos-settings-connections-mfa-required-modal.png`

Overlay modal on top of the Connections page (attempting to enable remote-control triggers this gate):

- Close (×) icon, top right
- Embedded preview mock of the ChatGPT web account-settings "Security" panel: nav rail **General / Notifications / Personalization / Connectors / Data controls / Security** (Security highlighted), showing "Multi-factor authentication (MFA)" with three rows: **Authenticator app** (ON) — "Use one-time codes from an authenticator app.", **Push notifications** (OFF) — "Approve log-ins with a push sent to your trusted device.", **Text message** (ON) — "Get 6-digit verification codes by SMS or WhatsApp based on your country."
- Modal headline: **"Turn on Multi-Factor Authentication"**
- Body: "To enable this feature, you'll need to turn on Multi-Factor Authentication for your ChatGPT account"
- Button: **Continue on chatgpt.com** (white pill) — hands off to the web account, out of the desktop app

**Notable:** enabling remote control of the local Mac is gated behind account-level MFA on the ChatGPT web account — a cross-surface security boundary enforced from inside a native macOS settings panel.

### 3. Connections → Remote pairing, Phone tab (QR code)

`034-codex-macos-settings-connections-remote-pairing-phone-tab-qr-code.png`

- Sidebar shows a live "remo" search filter (see nav-tree note above) while the pairing modal is open.
- Modal headline: **"Approve on your device to control this Mac remotely"**
- Sub-tabs: **Phone** (active) / Computer
- Phone tab: iPhone mockup showing a native-style confirmation prompt — "Allow this phone to access Codex on your computer?" with a back chevron and a monitor icon
- Below: a dark QR-code panel with a Codex-logo watermark centered in the code, plus a fullscreen-expand icon and a refresh icon in the panel's corners

### 4. Connections → Remote pairing, Computer tab (pairing code)

`035-codex-macos-settings-connections-remote-pairing-computer-tab-pairing-code.png`

- Same modal, **Computer** tab active
- Preview mockup of the target computer's own Settings → Connections → "Control other devices" tab, showing a "Set up" button
- Large monospace pairing code: **`ZPK6-7CEK`**, with copy icon and refresh icon
- Instructions: "Click **Add** in the **Settings > Connections > Control other devices** tab on your other computer and enter this code"

### 5. Connections → "You're connected" success modal

`052-codex-macos-settings-connections-search-remote-control-connected-modal.png`

- Success modal: checkmark over a blue abstract hero image, headline **"You're connected"**
- Body: "Make the most out of your new connection. You can change these later in Settings."
- Three toggles, all ON by default at connection time:
  - **Keep this Mac awake** — "Prevent sleep when this computer is plugged in and remote access is enabled"
  - **Use your Mac apps while locked** — "Control Mac apps from your phone. Learn more" (lock+device icon)
  - **Set up Chrome extension** — "Let ChatGPT navigate websites and fill out forms" (Chrome icon)
- Button: **Done**

### 6. Connections → Control this Mac — device list populated (iPhone, "1m")

`053-codex-macos-settings-connections-control-this-mac-devices.png`

- Header row now shows both a refresh icon and an **Add** button
- **Allow connections** toggle ON
- Device row: iPhone icon, **"iOS 26.5.2 iPhone"**, "Last connected 1m", **Revoke access** button
- "Other settings" → Keep this Mac awake ON

### 7. General → Composer / Popout Window / Notifications (mid-scroll)

`092-codex-macos-settings-general-composer-notifications-popout.png`

Top of visible content (page scrolled past the true top — not fully covered):

- "Imported agent setup" — "Last imported 2mo ago" — **Import again** button
- "Open source licenses" — "Third-party notices for bundled dependencies" — **View** button

**Composer** section:

- **Show context window usage** toggle — OFF
- **Send shortcut** — "Choose when Enter sends a prompt or inserts a new line" — dropdown: **Enter**
- **Follow-up behavior** — "Queue follow-ups while ChatGPT runs or steer the current run. Press ⌘⏎ to do the opposite for one message" — segmented control **Queue / Steer** (Steer selected)

**Popout Window** section:

- **Popout Window hotkey** — "Set a global shortcut for Popout Window. Leave unset to keep it off." — Off + edit pencil
- **Default to projectless chat** — "Start new chats without a project" — OFF

**Notifications** section:

- **Turn completion notifications** — "Set when ChatGPT alerts you that it's finished" — dropdown: **Only when unfocused**
- **Enable permission notifications** — "Show alerts when notification permissions are required" — ON
- **Enable question notifications** — "Show alerts when input is needed to continue" — ON

### 8. Profile → Stats / Activity / Plugins

`093-codex-macos-settings-profile-stats-activity-plugins.png`

- Top bar: "Profile" title; right-aligned **Share**, **Private** (lock icon), **Edit** (pencil)
- Avatar "SN", name **Siddhartha Nagula**, handle **@agiautomationllc · Pro** badge
- Stat pills: **3.9B** Lifetime tokens · **1.6B** Peak tokens · **16h 55m** Longest chat · **0 days** Current streak · **6 days** Longest streak
- **Token activity** heatmap with view toggle **Daily / Weekly / Cumulative** (Cumulative selected), month labels Aug→Jul across the bottom
- **Activity insights** (left column): Fast Mode 56% · Most used reasoning: Extra High · 47% · Skills explored: 27 · Total skills used: 218 · Total chats: 12
- **Most used plugins** (right column), icon + name + run count:
  - `$test-driven-development` — 47 runs
  - `$verification-before-completion` — 29 runs
  - `$improve-codebase-architecture` — 24 runs
  - `$ponytail` — 22 runs
  - `$code-structure` — 19 runs

**Notable:** a full gamified usage-analytics profile (lifetime/peak token counts, chat streaks, GitHub-style contribution heatmap, "skills" run leaderboard) lives inside Settings, not just an account page.

### 9. Appearance → Theme picker (light colors)

`094-codex-macos-settings-appearance-theme-picker-light-colors.png`

- **Theme** swatches: **System** / Light / Dark (System bordered/selected)
- Two side-by-side code-diff panels (red vs green) rendering a `ThemeConfig` JS object — `surface`, `accent` (`#2563eb` → `#0ea5e9`), `contrast` (`42` → `68`) — a live diff preview of the theme-token change as you edit
- **Light theme** panel: **Import** / **Copy theme** links, preset dropdown **"Aa Codex"**
  - Accent: `#339CFF` (highlighted swatch)
  - Background: `#FFFFFF`
  - Foreground: `#1A1C1F`
  - UI font: `-apple-system, Blink…` (truncated font-stack string)
  - **Translucent sidebar** toggle — ON
  - **Contrast** slider — 45
- **Dark theme** panel begins (Accent `#339CFF`, Background `#181818` visible at cutoff)

### 10. Appearance → Dark theme preferences (continued scroll)

`095-codex-macos-settings-appearance-dark-theme-preferences.png`

- **Dark theme** panel complete: Accent `#339CFF`, Background `#181818`, Foreground `#FFFFFF`, UI font `-apple-system, Blink…`, Translucent sidebar ON, Contrast slider **60**
- **Preferences** section:
  - **Use pointer cursors** — OFF — "Change the cursor to a pointer when hovering over interactive elements"
  - **Dock icon** — "Choose the icon the app will use in the dock" — two selectable icons (ChatGPT swirl icon bordered/selected; a blue Codex glyph as the alternative)
  - **Reduce motion** — segmented **System / On / Off** (System selected)
  - **UI font size** — numeric stepper input **14 px**
  - **Diff markers** — "Show changes using colors or +/- markers" — segmented **Color / +/-** (Color selected)
  - **Font smoothing** — ON — "Use native macOS font anti-aliasing"

### 11. Voice → Dictation / hotkeys / dictionary

`096-codex-macos-settings-voice-dictation-hotkeys-dictionary.png`

**Dictation** panel:

- **Microphone** — "Used for dictation" — dropdown: **System default**
- **Hold-to-dictate hotkey** — "Hold anywhere on desktop to dictate where your cursor is" — Off + edit pencil
- **Toggle dictation hotkey** — "Press once anywhere on desktop to dictate, then press again to stop" — Off + edit pencil
- **Keep dictation bar visible** — OFF — "Show a small shortcut reminder when dictation isn't recording"

**Dictation dictionary** panel — **+ Add entry** button — "Words or phrases dictation should recognize"

- One example row: text field `Jane Doe` + trash icon

**Recent dictations** panel — empty-state copy: "Your recent dictations will appear here so you can recover text if it does not land where you expected"

### 12. Configuration → Approval / sandbox / model / features

`097-codex-macos-settings-configuration-approval-sandbox-model-features.png`

- Subtitle: "Configure approval policy and sandbox settings **Learn more**"

**Custom config.toml settings**

- Left dropdown: **User config** ▾ / right link: **Open config.toml ↗**
- **Approval policy** — "Choose when ChatGPT asks for approval" — dropdown: **On request**
- **Sandbox settings** — "Choose how much ChatGPT can do when running commands" — dropdown: **Workspace write**
- **Allow network access** — OFF — "Allow network access when the sandbox is set to workspace write"

**Model features**

- **Available reasoning efforts** — "Choose which reasoning effort levels appear in model controls. Availability varies by model" — dropdown: **5 selected**
- **Ultra in model picker slider** — OFF — "Show Ultra as the highest slider option"

**Workspace Dependencies**

- **Codex dependencies** — ON — "Allow ChatGPT to install and expose bundled Node.js and Python tools"
- **Diagnose issues in Codex Workspace** — "Checks the current bundle and records diagnostic logs" — **🔍 Diagnose** button
- **Reset and install Workspace** — "Downloads a fresh bundle, installs it, and reloads tools" — **⬇ Reinstall** button (destructive-red)
- (cut off) "Current version: 26.715.12143…"

**Notable — this is the fullest evidence in the set of the approval/sandbox model:** a persistent user-editable `config.toml` backs the settings; "Approval policy" and "Sandbox settings" are two independently configured dropdowns (approval policy currently "On request"; sandbox currently "Workspace write"), with a _separate_ network-access toggle scoped specifically to when the sandbox is workspace-write. This is a three-axis permission model (when to ask / how much filesystem access / whether network is allowed) rather than a single trust slider.

### 13. Personalization → Personality / instructions / memory

`098-codex-macos-settings-personalization-personality-instructions-memory.png`

- Warning banner (amber): "Personality settings are not supported by every model. Codex's tone can be customized in Custom instructions."
- **Personality** — "Choose a default tone for ChatGPT responses" — dropdown: **Pragmatic**

**Custom instructions** (Save button, disabled while empty)

- "Give ChatGPT extra instructions and context for all chats on this host. **Learn more**"
- Empty textarea, placeholder "Add your custom instructions…"

**Memory** — "Configure how ChatGPT collects, retains, and consolidates memories. **Learn more**"

- **Enable memories** — OFF — "Generate new memories from chats and bring them into new chats"
- **Chronicle research preview** — OFF — "Augment memories with screen context so ChatGPT can help with anything you're working on. **Learn more**" _(explicitly labeled a research preview)_
- **Allow memory generation from tool-assisted chats** — ON — "Generate memories from chats that used MCP tools or web search"
- **Reset memories** — "Delete all ChatGPT memories" — **Reset** button (destructive-red)

### 14–15. Pets → Avatar picker (list top, then size slider)

`099-codex-macos-settings-pets-avatar-picker-list-top.png`, `100-codex-macos-settings-pets-avatar-picker-size-slider.png`

- Header "Pick a pet" — "Pets manage threads and surface what needs attention"
- Controls, top right: refresh icon, **Create** button, **Wake Pet** button
- Full pet roster (icon avatar, name, one-line flavor text, action button):
  1. **Codex** — "The original Codex companion." — _Selected_ (non-actionable label, current pick)
  2. **Dewey** — "A calm companion for focused workspace days" — Select
  3. **Fireball** — "Hot path energy for fast iteration." — Select
  4. **Hoots** — "A sharp-eyed owl for polished work in a blink." — Select
  5. **Rocky** — "A steady rock when the diff gets large." — Select
  6. **Seedy** — "Small green shoots for new ideas." — Select
  7. **Stacky** — "A balanced stack for deep work." — Select
  8. **BSOD** — "A tiny blue-screen gremlin." — Select
  9. **Null Signal** — "Quiet signal from the void." — Select
- **Custom pets** row: local path `/Users/siddhartha/.codex/pets` — **Open folder ↗**
- **Appearance** section: **Pet size** slider — "Adjust the size of your pet"

**Notable:** pets are framed as functional, not purely cosmetic ("manage threads and surface what needs attention"), and are user-extensible via a local `~/.codex/pets` folder, not just a fixed built-in roster.

### 16–23. Keyboard shortcuts — full transcription (8 screens, one continuous scrolling list)

`101` → `108`

The Keyboard Shortcuts screen is a single search box ("Search shortcuts", with a shortcut-recording icon at the right edge of the field) over one long, flat, ungrouped list — there are no section headers inside the list itself, unlike every other settings page. Each row shows: action name (bold), one-line description, one or more currently-bound key-chord badges (a row can have 2–3 bindings, e.g. a keyboard chord plus a mouse button), an edit-pencil icon per binding, and a trash icon per binding (trash is absent on "Unassigned" rows since there is nothing to delete). Transcribed top to bottom exactly as captured, including duplicate/overlapping bindings observed:

| #     | Action                        | Description                                                         | Bound shortcut(s)                       |
| ----- | ----------------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| 1     | New chat                      | Start a new chat                                                    | ⌘N · ⇧⌘O                                |
| 2     | Quick chat                    | Start a lightweight chat in the quick composer                      | ⌥⌘N                                     |
| 3     | Archive chat                  | Archive the current chat                                            | ⇧⌘A                                     |
| 4     | New standalone chat           | Start a new chat outside of any project                             | ⌥⌘O                                     |
| 5     | Open side chat                | Open the current chat in a side chat                                | ⌥⌘S                                     |
| 6     | Open in new window            | Open the current chat in a new window                               | Unassigned                              |
| 7     | Toggle pin                    | Pin or unpin the current chat                                       | ⌥⌘P                                     |
| 8     | Focus browser address bar     | Focus the in-app browser address bar                                | ⌘L                                      |
| 9     | Back                          | Go back in navigation history                                       | ⌘[ · Mouse Back                         |
| 10    | Forward                       | Go forward in navigation history                                    | ⌘] · Mouse Forward                      |
| 11    | Next recently viewed chat     | (cycle to next recently viewed chat)                                | ⌃Tab                                    |
| 12    | Next tab                      | Switch to the next tab                                              | ⌃Tab · ⇧⌘] · ⌥⌘Right                    |
| 13    | Next chat                     | Switch to the next chat                                             | ⇧⌘] · ⌥⌘Right                           |
| 14    | Previous recently viewed chat | Cycle to the previous recently viewed chat                          | ⌃⇧Tab                                   |
| 15    | Previous tab                  | Switch to the previous tab                                          | ⌃⇧Tab · ⇧⌘[ · ⌥⌘Left                    |
| 16    | Previous chat                 | Switch to the previous chat                                         | ⇧⌘[ · ⌥⌘Left                            |
| 17    | Switch chat…                  | Search and switch to a chat                                         | Unassigned                              |
| 18    | Open browser tab              | Open a new browser tab                                              | ⌘T                                      |
| 19    | Open review tab               | Open the review tab                                                 | ⌃⇧G                                     |
| 20    | Toggle bottom panel           | Show or hide the bottom panel                                       | ⌘J                                      |
| 21    | Toggle browser panel          | Show or hide the browser panel                                      | ⇧⌘B                                     |
| 22    | Toggle pinned summary         | Show or hide the pinned summary                                     | Unassigned                              |
| 23    | Toggle review                 | Show or hide Review for the current Git-backed chat                 | Unassigned                              |
| 24    | Toggle sidebar                | Show or hide the sidebar                                            | ⌘B                                      |
| 25    | Toggle Review panel           | Show or hide Review for the current chat                            | ⌥⌘B                                     |
| 26    | Open terminal                 | Open the terminal panel                                             | ⌃\`                                     |
| 27    | Environment action 1          | Run the environment action in this shortcut slot                    | ⇧⌘D                                     |
| 28–35 | Environment action 2–9        | Run the environment action in this shortcut slot                    | Unassigned (×8)                         |
| 36    | Commit or push                | Open commit or push options                                         | Unassigned                              |
| 37    | Create PR                     | Open pull request creation options                                  | Unassigned                              |
| 38    | Open folder                   | Add a local project to ChatGPT                                      | ⌘O                                      |
| 39    | Force reload skills           | Refresh the skill catalog for the current context                   | Unassigned                              |
| 40    | Go to skills                  | Browse installed and recommended skills                             | Unassigned                              |
| 41    | Import from other AI apps     | Import from other AI apps                                           | Unassigned                              |
| 42    | Install Codex Workspace       | Install dependencies for advanced local features                    | Unassigned                              |
| 43    | Keyboard shortcuts            | Customize keyboard shortcuts                                        | Unassigned                              |
| 44    | MCP                           | Configure MCP servers                                               | Unassigned                              |
| 45    | Personality                   | Adjust tone and response style                                      | Unassigned                              |
| 46    | Feedback                      | Send product feedback to the ChatGPT team                           | Unassigned                              |
| 47    | Log out                       | Sign out of ChatGPT                                                 | Unassigned                              |
| 48    | Manage scheduled tasks        | Create or manage scheduled tasks from the current page              | Unassigned                              |
| 49    | Show pet                      | Open the pet overlay                                                | Unassigned                              |
| 50    | Open control window           | Open the voice control window                                       | Unassigned                              |
| 51    | Redo last action              | Redo the most recently undone app action                            | ⇧⌘Z                                     |
| 52    | Settings                      | Open ChatGPT settings                                               | ⌘,                                      |
| 53    | Undo last action              | Undo the most recent app action                                     | ⌘Z                                      |
| 54    | Approve request               | Approve the active request                                          | ⏎ (Return)                              |
| 55    | Decline request               | Decline the active request                                          | Escape                                  |
| 56    | Close Tab                     | Close the active tab                                                | ⌘W                                      |
| 57    | Close                         | Close the active window                                             | ⌘W _(duplicate of Close Tab's binding)_ |
| 58    | Attach files and folders      | Attach files and folders to the active composer                     | Unassigned                              |
| 59    | Add photos                    | Add photos to the active composer                                   | Unassigned                              |
| 60    | Cycle reasoning effort        | Cycle through composer reasoning effort options                     | Unassigned                              |
| 61    | Decrease reasoning effort     | Decrease the current composer reasoning effort                      | Unassigned                              |
| 62    | Increase reasoning effort     | Increase the current composer reasoning effort                      | Unassigned                              |
| 63    | Open model picker             | Open the composer model picker                                      | ⌃⇧M                                     |
| 64    | Open project picker           | Open the composer project picker                                    | ⌥⇧⌘O                                    |
| 65    | Start dictation               | Start dictation in the current composer                             | ⌃⇧D                                     |
| 66    | Toggle voice mode             | Start or stop voice mode                                            | ⌃⇧V                                     |
| 67    | Send message                  | Send the current composer message                                   | Unassigned                              |
| 68    | Toggle Fast mode              | Turn Fast mode on or off in the current composer                    | Unassigned                              |
| 69    | Toggle plan mode              | Turn plan mode on or off in the current composer                    | Unassigned                              |
| 70    | Copy as Markdown              | Copy the current chat as Markdown                                   | Unassigned                              |
| 71    | Copy conversation path        | Copy the current chat path                                          | ⌥⇧⌘C                                    |
| 72    | Copy deeplink                 | Copy a deeplink to the current chat                                 | ⌥⌘L                                     |
| 73    | Copy session id               | Copy the current chat session ID                                    | ⌥⌘C                                     |
| 74    | Copy working directory        | Copy the current chat working directory                             | ⇧⌘C                                     |
| 75    | Continue in new chat          | Create a new chat from the current chat                             | Unassigned                              |
| 76    | Hold-to-dictate hotkey        | Hold anywhere on desktop to dictate where your cursor is            | Unassigned                              |
| 77    | Toggle dictation hotkey       | Press once anywhere on desktop to dictate, then press again to stop | Unassigned                              |
| 78    | Force Reload Browser Page     | Force reload the active browser page                                | ⇧⌘R                                     |
| 79    | Popout Window hotkey          | Show or hide Popout Window from anywhere on desktop                 | Unassigned                              |
| 80    | Browser back                  | Go back in browser history                                          | ⌘Left                                   |
| 81    | Browser forward               | Go forward in browser history                                       | ⌘Right                                  |
| 82    | New Window                    | Open a new window                                                   | ⇧⌘N                                     |
| 83    | Open command menu             | Open the command menu                                               | ⌘K · ⇧⌘P                                |
| 84    | Reload Browser Page           | Reload the active browser page                                      | ⌘R                                      |
| 85    | Rename chat                   | Rename the current chat                                             | ⌥⌘R                                     |
| 86    | Search Files…                 | Search files                                                        | ⌘P                                      |
| 87    | Show keyboard shortcuts       | Show the shortcuts available right now                              | ⌘/                                      |
| 88–96 | Go to chat 1–9                | Open the visible chat in this shortcut slot                         | ⌘1 … ⌘9                                 |
| 97    | Toggle File Tree              | Toggle the file tree panel                                          | ⇧⌘E                                     |
| 98    | Toggle maximize side panel    | Expand or restore the side panel                                    | Unassigned                              |
| 99    | Start Trace Recording         | Start or stop trace recording                                       | ⇧⌘S                                     |

(List may continue past row 99 — the bottom of screen 108 is the last row captured; further rows are **not covered**.)

### 24–25. Usage & billing → Plan / credits / usage limits / cancel plan

`109-codex-macos-settings-billing-plan-credits-usage-limits.png`, `110-codex-macos-settings-billing-usage-limits-cancel-plan.png`

- Subtitle: "To view invoices, change your payment method, and take other actions, visit **settings** on Web"
- **Your plan** — "Pro plan" / "$200/mo" — **View plans** button
- **Credits balance** — "Buy credits or turn on auto-reload to continue using Codex if you hit a limit. **Learn more**" — "$0 Current balance · **Set up auto-reload**" — **Buy credits** button
- **General usage limits** — "Weekly usage limit" / "Resets Jul 28" — progress bar (full) — "100% left"
- **"GPT-5.3-Codex-Spark" usage limits** _(verbatim on-screen label, see caveats)_ — "Weekly usage limit" / "Resets Jul 28" — progress bar (full) — "100% left"
- **Usage limit resets** — empty state: "No resets available"
- **Cancel plan** — "Your subscription is managed through ChatGPT. Go to **billing** to cancel your plan"

**Notable:** the app shows both an aggregate "General usage limits" meter and a second, model-specific weekly usage meter — i.e. usage limiting is modeled per-model, not just per-account, and both currently read 100% left with the same reset date (Jul 28).

### 26. Appshots → Hotkey / destination / preview

`111-codex-macos-settings-appshots-hotkey-destination-preview.png`

- Info banner: "Take an appshot to show ChatGPT your frontmost window" — "Appshots include visual and text content, including text scrolled offscreen"
- **Hotkey** — "Press both ⌘ keys simultaneously" — dropdown: **⌘ + ⌘**
- **Appshot destination** — "Choose where appshots go when you use the hotkey" — dropdown: **Automatic**
- **Play sound effect** — ON
- Right-side live preview: a captured browser window stacked above a photo of hands typing on a MacBook keyboard, illustrating the visual+context bundle an appshot captures

**Notable:** a double-tap-⌘ global hotkey snapshots the frontmost window (visual _and_ offscreen-scrolled text) as ad hoc context for the agent — a screenshot-based context-injection feature distinct from Computer Use.

### 27. Plugins → Plugin list (toggles on)

`112-codex-macos-settings-plugins-plugin-list-toggles-on.png`

- Subtitle: "Manage plugins, skills, and MCPs"
- Count pills: **Plugins 22** (active tab) · Apps 7 · MCPs 5 · Skills 45
- Search box: "Search plugins"
- List (icon, name, description, toggle — all ON in this capture):
  - **Documents** — Create and edit document artifacts
  - **PDF** — Read, create, and verify PDF files
  - **Spreadsheets** — Create and edit spreadsheet files
  - **Presentations** — Create and edit presentations
  - **Template Creator** — Create or update templates for documents, spreadsheets, and presentations
  - **Sites** — Build and deploy websites with Sites
  - **Browser** — Control the in-app browser with ChatGPT
  - **Chrome** — Control Chrome with ChatGPT
  - **Computer Use** — Control Mac apps from ChatGPT
  - **Visualize** — Turn ideas and data into interactive visuals _(cut off at bottom, more below not captured)_

**Notable:** "Plugins" is a superset umbrella (22 plugins / 7 apps / 5 MCPs / 45 skills, each independently toggleable) — document/spreadsheet/presentation/site creation plugins sit in the same list as Browser/Chrome/Computer-Use control plugins.

### 28–29. Browser → General / autofill / downloads / permissions / developer mode

`113-codex-macos-settings-browser-general-autofill-downloads.png`, `114-codex-macos-settings-browser-permissions-developer-mode-cdp.png`

- Subtitle: "Manage the built-in browser. Google Chrome can be set up in **computer use settings**"
- Top card: **Browser** — "Let ChatGPT control the built-in browser" — ON

**General** (Import… link)

- **Web URL and link open destination** — "Where links open by default" — dropdown: **Default browser**
- **Local URL open destination** — "Where local development sites open by default" — dropdown: **ChatGPT**
- **Browsing data** — "Clear browsing history, site data, cache, and download history from the in-app browser" — split button **Clear all browsing data ▾**
- **Annotation screenshots** — "Screenshots help ChatGPT better understand and address comments, but increase plan usage" — dropdown: **Always include**

**Autofill and passwords**

- **Password manager** — "Add, delete, and edit saved passwords" — **Manage**
- **Contact info** — "Add, delete, and edit saved addresses, phone numbers, and email addresses" — **Manage**

**Downloads**

- **Location** — "System Downloads folder" — **Change**
- **Ask where to save downloads** — OFF
- **Download history** — "View and manage files downloaded from the built-in browser" — **Manage**

**Permissions**

- **Site settings** — "Control camera and microphone permissions in the built-in browser" — **Manage**
- **Approval** — "Choose if ChatGPT asks for approval before opening websites. **Learn more**" — dropdown: **Always allow**

**Site permissions** (+ Add) — "Override the defaults above for specific sites" — empty: "No site-specific permissions yet"

**Developer mode**

- ⚠ **Elevated risk** label
- **Enable full CDP access** — OFF — "Allow ChatGPT to use full Chrome DevTools Protocol (CDP) access in connected Browser Use sessions. Full CDP access lets ChatGPT inspect and control sensitive browser internals that may put your data at risk."

### 30. Computer use → Control apps / Chrome / Excel

`115-codex-macos-settings-computer-use-control-apps-chrome-excel.png`

- Subtitle: "Manage how ChatGPT uses other applications on your computer"

**Control**

- **Any App** — ON — "Let ChatGPT control apps on your computer"
- **Google Chrome** — green-dot "Connected to browser extension for additional control" — **Manage** button + toggle ON
- **Microsoft Excel** — ON — "Let ChatGPT use Microsoft Excel add-in for additional control"
- **Locked use** — ON — "Let ChatGPT use your Mac when it's locked. **Learn more**"

**Picture in picture**

- **Always hide picture in picture** — OFF — "Prevent ChatGPT from showing computer use activity in picture in picture"

**Always-allowed apps** — empty state: "None yet"

**Notable:** Computer Use is generalized OS automation ("Any App" toggle controls arbitrary applications), plus two named first-class integrations (a Chrome browser-extension bridge and a Microsoft Excel add-in), plus explicit support for continuing to act while the screen is locked, plus a picture-in-picture activity indicator that can be suppressed.

### 31. Hooks → Empty state

`116-codex-macos-settings-hooks-empty-state-no-hooks.png`

- Subtitle: "Manage lifecycle hooks from config and enabled plugins. **Learn more**" + refresh icon
- Empty state: **"No hooks found"** / "Configured hooks will appear here"

### 32. Connections → Control this Mac (iPhone, "1h")

`117-codex-macos-settings-connections-control-this-mac-iphone.png`

- Same layout as screen 6 (053): device row "iOS 26.5.2 iPhone" / "Last connected 1h" / **Revoke access** — essentially the same state at a later point in the same session (1m → 1h since last connection).

### 33. Git → Branch prefix / PR instructions

`118-codex-macos-settings-git-branch-prefix-pr-instructions.png`

- **Branch prefix** — "Prefix used when ChatGPT creates new branches" — text input: **`codex/`**
- **Pull request merge method** — "Choose how ChatGPT merges pull requests" — segmented **Merge / Squash** (Merge selected)
- **Always force push** — OFF — "Use --force-with-lease when pushing from ChatGPT"
- **Create draft pull requests** — ON — "Use draft pull requests by default when creating PRs from ChatGPT"
- **Review delivery** — "Start /review in the current chat when possible or launch a separate review chat" — segmented **Inline / Detached** (Inline selected)
- **Commit instructions** (Save, disabled) — "Added to commit message generation prompts" — empty textarea, placeholder "Add commit message guidance…"
- **Pull request instructions** (Save) — "Added to PR title/description generation prompts" — empty textarea, placeholder "Add pull request guidance…"

### 34. Environments → Project list

`119-codex-macos-settings-environments-project-list.png`

- Subtitle: "Local environments tell ChatGPT how to set up worktrees for a project. **Learn more.**"
- "Select a project" + **Add project** button
- Rows (icon, name, owner, "+" add button):
  - **agiworkforce** / siddharthanagula3
  - **cli** / siddharthanagula3

### 35. Worktrees → Root and autodelete

`120-codex-macos-settings-worktrees-root-and-autodelete.png`

- **Worktree root** — "Directory where ChatGPT creates managed worktrees; leave blank to use the default location" — text input: **Default**
- **Automatically delete old worktrees** — ON — "Recommended for most users. Turn this off only if you want to manage old worktrees and disk usage yourself."
- **Auto-delete limit** — "Number of managed worktrees to keep before older ones are pruned automatically. ChatGPT snapshots worktrees before deleting, so pruned worktrees should always be restorable." — numeric input: **5**
- Empty state (refresh icon): **"No worktrees yet"** / "Worktrees created by ChatGPT will appear here"

### 36. Archived chats → Empty

`121-codex-macos-settings-archived-chats-empty.png`

- Empty state: **"No archived chats"**

### 37. Computer use → Google Chrome sub-page (permissions / CDP)

`155-codex-macos-settings-computer-use-chrome-permissions-cdp.png`

- Breadcrumb: **Computer use › Google Chrome**
- Title "Google Chrome", right-aligned **Reinstall extension** + **Remove extension** (destructive-red text)
- Status: green dot **"Connected"**

**Permissions**

- **Approval** — "Choose if ChatGPT asks for approval before opening websites. **Learn more**" — dropdown: **Always allow**
- **History** — "Choose if ChatGPT asks for approval before accessing your browser's history" — dropdown: **Always ask**
- **Downloads** — "Choose if ChatGPT asks before downloading files from websites" — dropdown: **Always ask**
- **Uploads** — "Choose if ChatGPT asks before uploading files to websites" — dropdown: **Always ask**

**Site permissions** (+ Add) — empty: "No site-specific permissions yet"

**Developer mode**

- ⚠ **Elevated risk**
- **Enable full CDP access** — OFF — same description as screen 114

**Notable — two independent CDP toggles exist:** one on the built-in Codex browser (screen 114) and a separate one here on the externally-connected Google Chrome extension (screen 155). Only the Chrome-extension page breaks approval down into four separately configurable categories (Approval / History / Downloads / Uploads); the built-in browser page has only the single "Approval" dropdown. This is a materially finer-grained permission model for the external-browser integration than for the sandboxed in-app browser.

---

## Control inventory table

| Screen                        | Control                                                                        | Type                        | What it appears to do                                                              |
| ----------------------------- | ------------------------------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------- |
| Connections                   | Allow connections                                                              | Toggle                      | Master switch for remote devices controlling this Mac                              |
| Connections                   | Add (device)                                                                   | Button                      | Opens QR/pairing-code modal to authorize a new controlling device                  |
| Connections                   | Revoke access                                                                  | Button (per device)         | Immediately deauthorizes a connected controlling device                            |
| Connections                   | Keep this Mac awake                                                            | Toggle                      | Prevents sleep while plugged in and remote access enabled                          |
| Connections (MFA modal)       | Continue on chatgpt.com                                                        | Button                      | Hands off to web account settings to enable MFA before remote control can proceed  |
| Connections (pairing)         | Phone / Computer                                                               | Sub-tabs                    | Switches between QR-code pairing (phone) and code-entry pairing (another computer) |
| Connections (pairing)         | Copy / Refresh (code)                                                          | Icon buttons                | Copies pairing code text; regenerates the code/QR                                  |
| Connections (connected modal) | Keep this Mac awake / Use your Mac apps while locked / Set up Chrome extension | Toggles                     | Bundled onboarding toggles offered right after a device pairs                      |
| General                       | Import again                                                                   | Button                      | Re-imports a previously imported agent setup                                       |
| General                       | View (licenses)                                                                | Button                      | Opens open-source license notices                                                  |
| General                       | Show context window usage                                                      | Toggle                      | Shows/hides live context-window usage in composer                                  |
| General                       | Send shortcut                                                                  | Dropdown                    | Enter sends vs. inserts newline                                                    |
| General                       | Follow-up behavior                                                             | Segmented (Queue/Steer)     | Controls whether follow-up messages queue or interrupt/steer a running turn        |
| General                       | Popout Window hotkey                                                           | Hotkey field + edit         | Sets a global shortcut to show/hide a popout window                                |
| General                       | Default to projectless chat                                                    | Toggle                      | New chats skip project association by default                                      |
| General                       | Turn completion notifications                                                  | Dropdown                    | When to alert on task completion (e.g. "Only when unfocused")                      |
| General                       | Enable permission / question notifications                                     | Toggles                     | Alert when permission or input is needed                                           |
| Profile                       | Share / Private / Edit                                                         | Buttons                     | Profile-level sharing, visibility, and edit actions                                |
| Profile                       | Daily/Weekly/Cumulative                                                        | Segmented                   | Switches token-activity heatmap aggregation                                        |
| Appearance                    | System / Light / Dark                                                          | Theme swatches              | Sets overall app theme source                                                      |
| Appearance                    | Import / Copy theme                                                            | Links (per theme)           | Imports or duplicates a theme's token set                                          |
| Appearance                    | Theme preset dropdown                                                          | Dropdown                    | Selects a named theme preset ("Codex") per light/dark variant                      |
| Appearance                    | Accent / Background / Foreground                                               | Color swatches              | Per-theme color tokens (hex-editable)                                              |
| Appearance                    | UI font                                                                        | Text field                  | Font-stack override                                                                |
| Appearance                    | Translucent sidebar                                                            | Toggle (per theme)          | Sidebar transparency                                                               |
| Appearance                    | Contrast                                                                       | Slider (per theme)          | Contrast level, 0–100-ish scale                                                    |
| Appearance                    | Use pointer cursors                                                            | Toggle                      | Pointer cursor on hover for interactive elements                                   |
| Appearance                    | Dock icon                                                                      | Icon picker                 | Chooses app-icon variant shown in the macOS Dock                                   |
| Appearance                    | Reduce motion                                                                  | Segmented (System/On/Off)   | Animation reduction                                                                |
| Appearance                    | UI font size                                                                   | Numeric stepper (px)        | Base UI font size                                                                  |
| Appearance                    | Diff markers                                                                   | Segmented (Color/+-)        | Diff rendering style                                                               |
| Appearance                    | Font smoothing                                                                 | Toggle                      | Native macOS font anti-aliasing                                                    |
| Voice                         | Microphone                                                                     | Dropdown                    | Input device selection for dictation                                               |
| Voice                         | Hold-to-dictate / Toggle dictation hotkey                                      | Hotkey fields + edit        | Two distinct dictation activation modes                                            |
| Voice                         | Keep dictation bar visible                                                     | Toggle                      | Persistent on-screen dictation reminder                                            |
| Voice                         | Dictation dictionary                                                           | List + Add entry            | Custom word/phrase recognition list                                                |
| Voice                         | Recent dictations                                                              | Empty-state panel           | Recovery buffer for misplaced dictated text                                        |
| Configuration                 | User config dropdown / Open config.toml                                        | Dropdown + link             | Selects config scope; opens raw TOML file                                          |
| Configuration                 | Approval policy                                                                | Dropdown                    | When ChatGPT asks for approval to act ("On request")                               |
| Configuration                 | Sandbox settings                                                               | Dropdown                    | Filesystem access level for commands ("Workspace write")                           |
| Configuration                 | Allow network access                                                           | Toggle                      | Network access specifically under workspace-write sandbox                          |
| Configuration                 | Available reasoning efforts                                                    | Dropdown (multi-select)     | Which reasoning-effort levels surface in model controls                            |
| Configuration                 | Ultra in model picker slider                                                   | Toggle                      | Exposes "Ultra" as top slider option                                               |
| Configuration                 | Codex dependencies                                                             | Toggle                      | Allows installing bundled Node.js/Python tools                                     |
| Configuration                 | Diagnose / Reinstall (Workspace)                                               | Buttons                     | Diagnostics and full reinstall of the local Codex Workspace bundle                 |
| Personalization               | Personality                                                                    | Dropdown                    | Default response tone ("Pragmatic")                                                |
| Personalization               | Custom instructions                                                            | Textarea + Save             | Free-text guidance applied to all chats on this host                               |
| Personalization               | Enable memories                                                                | Toggle                      | Master memory generation switch                                                    |
| Personalization               | Chronicle research preview                                                     | Toggle                      | Screen-context-augmented memory (explicitly beta)                                  |
| Personalization               | Allow memory generation from tool-assisted chats                               | Toggle                      | Memory generation scoped to MCP/web-search chats                                   |
| Personalization               | Reset memories                                                                 | Destructive button          | Deletes all memories                                                               |
| Pets                          | Select / Wake Pet / Create                                                     | Buttons                     | Chooses active pet, wakes a sleeping pet, creates a custom one                     |
| Pets                          | Open folder (custom pets)                                                      | Link                        | Opens local `~/.codex/pets` directory                                              |
| Pets                          | Pet size                                                                       | Slider                      | Visual size of the pet overlay                                                     |
| Keyboard shortcuts            | Search shortcuts                                                               | Search field                | Filters the full shortcut list                                                     |
| Keyboard shortcuts            | Edit (pencil) / Delete (trash) per binding                                     | Icon buttons                | Rebind or remove an individual key-chord binding                                   |
| Usage & billing               | View plans                                                                     | Button                      | Opens plan comparison/upgrade                                                      |
| Usage & billing               | Buy credits / Set up auto-reload                                               | Button + link               | Purchases credits; configures automatic top-up                                     |
| Usage & billing               | (Cancel plan) billing link                                                     | Link                        | Routes to web billing to cancel subscription                                       |
| Appshots                      | Hotkey                                                                         | Dropdown                    | Global chord to trigger an appshot ("⌘ + ⌘")                                       |
| Appshots                      | Appshot destination                                                            | Dropdown                    | Where captured appshots are sent ("Automatic")                                     |
| Appshots                      | Play sound effect                                                              | Toggle                      | Audio feedback on capture                                                          |
| Plugins                       | Plugins/Apps/MCPs/Skills                                                       | Count-tab pills             | Switches the catalog view between four inventories                                 |
| Plugins                       | Search plugins                                                                 | Search field                | Filters plugin catalog                                                             |
| Plugins                       | Per-plugin toggle                                                              | Toggle (per row)            | Enables/disables an individual plugin                                              |
| Browser                       | Browser (master)                                                               | Toggle                      | Lets ChatGPT control the built-in browser at all                                   |
| Browser                       | Web/Local URL open destination                                                 | Dropdowns                   | Default handling for external vs local dev URLs                                    |
| Browser                       | Clear all browsing data                                                        | Split button                | Clears history/cache/site data/downloads                                           |
| Browser                       | Annotation screenshots                                                         | Dropdown                    | When screenshots are attached to review comments                                   |
| Browser                       | Password manager / Contact info                                                | Manage buttons              | Opens saved-credential and saved-address managers                                  |
| Browser                       | Download location / Ask where to save / Download history                       | Field + toggle + Manage     | Download destination and prompting behavior                                        |
| Browser                       | Site settings (camera/mic)                                                     | Manage button               | Per-site camera/microphone permission manager                                      |
| Browser                       | Approval (site open)                                                           | Dropdown                    | Whether opening websites needs approval                                            |
| Browser                       | Site permissions                                                               | List + Add                  | Per-site permission overrides                                                      |
| Browser                       | Enable full CDP access                                                         | Toggle (Elevated risk)      | Full Chrome DevTools Protocol access for the in-app browser                        |
| Computer use                  | Any App                                                                        | Toggle                      | Master switch for controlling arbitrary desktop apps                               |
| Computer use                  | Google Chrome                                                                  | Toggle + Manage             | Browser-extension-based additional control, with drill-down page                   |
| Computer use                  | Microsoft Excel                                                                | Toggle                      | Excel add-in-based additional control                                              |
| Computer use                  | Locked use                                                                     | Toggle                      | Allows automation while the Mac is locked                                          |
| Computer use                  | Always hide picture in picture                                                 | Toggle                      | Suppresses the PiP activity indicator                                              |
| Computer use                  | Always-allowed apps                                                            | Empty list                  | Per-app allowlist (currently empty)                                                |
| Computer use → Chrome         | Approval / History / Downloads / Uploads                                       | 4 dropdowns                 | Fine-grained per-category approval gates for the Chrome extension                  |
| Computer use → Chrome         | Reinstall extension / Remove extension                                         | Buttons                     | Extension lifecycle management                                                     |
| Hooks                         | (none — empty state)                                                           | —                           | Lifecycle hooks from config/plugins; none configured                               |
| Git                           | Branch prefix                                                                  | Text field                  | Prefix for auto-created branches ("codex/")                                        |
| Git                           | Pull request merge method                                                      | Segmented (Merge/Squash)    | Default PR merge strategy                                                          |
| Git                           | Always force push                                                              | Toggle                      | Use `--force-with-lease`                                                           |
| Git                           | Create draft pull requests                                                     | Toggle                      | PRs default to draft                                                               |
| Git                           | Review delivery                                                                | Segmented (Inline/Detached) | Where `/review` output is delivered                                                |
| Git                           | Commit instructions / PR instructions                                          | Textareas + Save            | Freeform guidance injected into commit/PR generation prompts                       |
| Environments                  | Add project                                                                    | Button                      | Registers a local project as an environment                                        |
| Environments                  | Project row "+"                                                                | Button                      | Adds/configures worktree setup for that project                                    |
| Worktrees                     | Worktree root                                                                  | Text field                  | Custom directory for managed worktrees                                             |
| Worktrees                     | Automatically delete old worktrees                                             | Toggle                      | Auto-pruning of stale worktrees                                                    |
| Worktrees                     | Auto-delete limit                                                              | Numeric field               | Count of worktrees retained before pruning                                         |
| Archived chats                | (none — empty state)                                                           | —                           | No archived chats present                                                          |

---

## Notable design decisions

- **Three-axis agent permission model, not one slider.** Configuration separates _when to ask_ (Approval policy), _how much filesystem access_ (Sandbox settings), and _whether network is allowed_ (a toggle scoped only to workspace-write sandbox) into three independently configured controls, all editable both via UI dropdowns and directly via an exposed `config.toml`/"Open config.toml" escape hatch. This is the single richest piece of evidence in the whole set for how a shipping agentic coding app models trust.

- **Two-tier, two-surface CDP/developer-mode gating.** "Elevated risk" full Chrome DevTools Protocol access is offered on _two separate_ pages — the sandboxed built-in browser (single Approval dropdown) and the externally-connected Chrome extension (four separately configurable Approval/History/Downloads/Uploads dropdowns) — both defaulting OFF and both carrying an explicit orange risk label. Remote-control pairing is gated behind account-level MFA via a hand-off to the web app, not handled locally at all.

- **Settings search indexes control body copy, not just titles**, and each hit becomes a direct sidebar shortcut into the exact nested control — visible from the "remo" search returning "Remote control" (Connections), "Remove" (under both Browser and Computer use), "Voice", "Reduce motion" (Appearance), etc., as live jump targets.

- **Config editable at three altitudes simultaneously**: GUI dropdown/toggle, structured file (`config.toml`, with an explicit "Open config.toml" escape hatch and a "User config" scope selector), and freeform natural-language instruction boxes (Custom instructions, Commit instructions, Pull request instructions) — three different mechanisms for steering the same agent, each suited to a different kind of rule.

- **Heavy use of destructive-red for irreversible actions** (Reset memories, Remove extension, Reinstall Workspace) contrasted with neutral buttons for safe/reversible actions (Manage, Select, Add), giving a consistent visual "danger" vocabulary across otherwise very different settings pages.

- **Progressive disclosure via drill-down, not accordions.** Computer Use → Google Chrome is a full breadcrumbed sub-page (`Computer use › Google Chrome`) rather than an inline expansion, letting that one integration carry a materially deeper permission model (4 dropdowns) than fits on the parent list page.

- **Gamification and personality features (Profile stats, Pets) sit at the same navigational level as hard infrastructure settings (Sandbox, Git, Worktrees)** — there is no visual demotion of the "fun" surfaces (streaks, token heatmap, pet roster) relative to security/infra surfaces; both live directly in the primary "Personal"/"Coding" sidebar groups.

- **Live diff preview for theme edits.** The Appearance page renders a red/green code diff of the underlying `ThemeConfig` object as the user adjusts theme tokens — an unusually literal "show the config, not just the widget" pattern for a settings UI.

- **Every list-shaped settings page uses the same empty-state grammar**: bold headline ("No hooks found", "No archived chats", "No worktrees yet", "None yet") + one line of grey explanatory copy, with no illustration — a consistent, minimal empty-state vocabulary reused across at least five different data types (hooks, archived chats, worktrees, always-allowed apps, site permissions).

## Capabilities visible here that web documentation would not tell you

- The exact **three-control approval/sandbox/network model** and its live-selected default values (On request / Workspace write / network access OFF) — and that it's simultaneously backed by a raw, user-editable `config.toml` with a "User config" scope selector.
- That remote control of the desktop Mac from a phone or another computer **requires enabling account MFA on the web**, enforced via an in-app modal that hands off to chatgpt.com — a cross-surface security dependency not discoverable from either surface's docs alone.
- The **exact pairing UX**: QR code (phone) vs. typed pairing code (computer), format `XXXX-XXXX` (e.g. `ZPK6-7CEK`), and that pairing immediately offers to bundle in three follow-on toggles (keep-awake, control-while-locked, Chrome extension setup).
- That there are **two independent, separately configured CDP/"Elevated risk" developer-mode toggles** — one for the built-in browser, one for the externally connected Chrome extension — and that only the Chrome extension gets four-way granular approval (Approval/History/Downloads/Uploads) versus the built-in browser's single Approval dropdown.
- The **live numeric shape of the account's usage**: dual usage-limit meters (a "General" meter and a separate model-specific meter), both resetting on the same weekly cadence, plus a $0 credits balance with an optional auto-reload path independent of the base subscription.
- The **full 99+-row keyboard shortcut catalog** including many actions with zero public surface elsewhere (9 numbered "Environment action" slots, 9 numbered "Go to chat" slots, dedicated Approve-request/Decline-request bindings mapped to Return/Escape, and multiple copy actions — Markdown, deeplink, session ID, working directory, conversation path — that reveal internal concepts like "session id" and "conversation path" as addressable, copyable objects).
- That **Computer Use ships a named Microsoft Excel add-in integration** alongside the more expected "Any App" and Chrome-extension controls, and an explicit "Locked use" toggle permitting automation while the screen is locked.
- The **Pets feature's functional framing and extensibility**: pets are pitched as managing threads/surfacing attention-needed items (not purely decorative), ship with 9 named built-in characters with individual flavor text, and are user-extensible by dropping files into a documented local folder path (`~/.codex/pets`).
- The **"Appshot" capture mechanic**: a double-⌘-tap global hotkey that captures the frontmost window's visual _and_ offscreen-scrolled text as agent context, independent of the Computer Use automation system.
- The **Profile page's gamified analytics**: lifetime/peak token counts, longest-chat duration, current/longest daily streaks, a GitHub-style contribution heatmap of token activity, and a "most used plugins" leaderboard keyed by literal `$skill-name` slugs — none of which is likely to appear in product marketing or docs.
- The **plugin catalog's true breadth**: 22 plugins / 7 apps / 5 MCPs / 45 skills, independently toggleable, spanning document/spreadsheet/presentation/site-building tools alongside the coding-agent-specific integrations — evidence that "Codex" the desktop app is scoped well beyond a coding CLI.
