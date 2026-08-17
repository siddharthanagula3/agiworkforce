# Claude iOS App — Screenshot Evidence

**Scope:** `claude-ios-*` and `other-ios-*` filenames across the three reference directories.
**Files reviewed:** 31 images, all opened and visually inspected with the Read tool (list below).
**Source directories:**

- `/Users/siddhartha/Desktop/claude_reference/` (29 files, numbered 103–131)
- `/Users/siddhartha/Desktop/references-2/` (1 file — a second, differently-worded capture of the Cowork cross-device onboarding screen)
- `/Users/siddhartha/Desktop/chatgpt_reference/` (1 file — `025-other-ios-settings-legal-links-claude-app-version-popover.png`, filed under `other-ios-*` naming but is a Claude iOS screen)

## Caveats (read before using this as ground truth)

- **Point-in-time captures, unknown provenance.** Status-bar clocks show two distinct capture windows: **8:44–8:47** (battery 66%→66%, onboarding/Cowork/Dispatch screens) and **9:10–9:12** (battery 63%→62%, Chats/Projects/Artifacts/Code/Settings screens). The `references-2` Cowork-onboarding variant is timestamped **4:49** at 60% battery — a third, separate session. There is no visible date on any screen; "current" freshness cannot be confirmed from the images alone.
- **Two different Cowork-onboarding screens exist in this evidence set, not one.** File `104` (Get-started, phone/laptop/lightning icons, no "Beta" badge) and `claude-ios-cowork-01-cross-device-continuity-onboarding.png` (Beta badge, checklist/clock/globe icons, "Start a Cowork task"/"Not now" buttons, a live iOS-notification + browser-window illustration) show materially different copy and CTAs for what appears to be the same feature announcement. Treat these as two builds/variants, not confirmed sequential states — flagged explicitly rather than merged.
- **"Fable 5" does not match any publicly known Anthropic model name.** It appears as the pre-selected/default entry in the Cowork "Select model" modal (file 107) and as a named weekly-usage bucket ("Fable only") in Settings › Usage (file 123), alongside otherwise-plausible entries "Opus 4.8," "Sonnet 5," "Haiku 4.5." Per repo policy, model identifiers must come from the canonical model registry, not screenshots or training data — this document transcribes the on-screen string verbatim as evidence but does **not** assert "Fable 5" is a real, current, or planned Anthropic model. It is flagged as unverified/unusual and should be checked against `packages/contracts/types/src/models.json` or current official sources before being used anywhere beyond this research note.
- **Personal data in-frame:** the Dispatch setup and pairing-failure screens (111, 113) display the signed-in account email (`agiautomationllc@gmail.com`) inline as product copy ("Sign in as …", "You're signed in as …"). Transcribed as-is since it is the capturing user's own account, but note this is a live personal identifier, not placeholder text.
- No screen in this set shows a **connected** connector, an in-progress Dispatch remote-control session, a populated Artifacts/Code-sessions list, a populated Scheduled-runs list, or voice personas 3–5 (only "Buttery" and a sliver of "Airy" are visible, with page dots indicating 5 total). These states are **not covered by these captures** — do not infer their contents.
- No login/signup, no "New task" composer expanded, no in-progress Cowork task detail view, and no successful (non-empty) Code-sessions/Dispatch-connected state appear anywhere in this set.

## File-by-file log

| #   | File                                                                              | Directory         | Screen                                               |
| --- | --------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------- |
| 1   | `103-claude-ios-onboarding-memory-announcement-quarter-review-example.png`        | claude_reference  | Memory announcement onboarding modal                 |
| 2   | `104-claude-ios-onboarding-cowork-announcement-mobile-check-in.png`               | claude_reference  | Cowork cross-device announcement (variant A)         |
| 3   | `105-claude-ios-cowork-task-list-llm-reference-doc-task-card.png`                 | claude_reference  | Cowork task list                                     |
| 4   | `106-claude-ios-cowork-select-mode-modal-ask-before-acting-selected.png`          | claude_reference  | Cowork "Select mode" bottom sheet                    |
| 5   | `107-claude-ios-cowork-select-model-modal-fable-5-opus-sonnet-haiku.png`          | claude_reference  | Cowork "Select model" bottom sheet                   |
| 6   | `108-claude-ios-cowork-add-context-modal-camera-photos-files-connectors.png`      | claude_reference  | Cowork "Add context" bottom sheet                    |
| 7   | `109-claude-ios-cowork-scheduled-runs-no-scheduled-runs-empty-state.png`          | claude_reference  | Cowork → Scheduled runs (empty)                      |
| 8   | `110-claude-ios-dispatch-intro-reach-desktop-from-pocket.png`                     | claude_reference  | Dispatch intro                                       |
| 9   | `111-claude-ios-dispatch-setup-steps-download-sign-in-complete-setup.png`         | claude_reference  | Dispatch desktop-setup steps                         |
| 10  | `112-claude-ios-dispatch-pairing-progress-looking-for-your-desktop.png`           | claude_reference  | Dispatch pairing in progress                         |
| 11  | `113-claude-ios-dispatch-pairing-failed-troubleshooting-checklist-try-again.png`  | claude_reference  | Dispatch pairing failed                              |
| 12  | `114-claude-ios-code-sessions-empty-no-devices-no-sessions-found.png`             | claude_reference  | Code (sessions) — empty                              |
| 13  | `115-claude-ios-artifacts-empty-no-artifacts-yet.png`                             | claude_reference  | Artifacts — empty                                    |
| 14  | `116-claude-ios-projects-list-how-to-use-claude-project.png`                      | claude_reference  | Projects list                                        |
| 15  | `117-claude-ios-chats-list-greeting-and-two-older-chats.png`                      | claude_reference  | Chats list                                           |
| 16  | `118-claude-ios-nav-drawer-chats-recents-new-chat-button.png`                     | claude_reference  | Nav drawer (hamburger menu)                          |
| 17  | `119-claude-ios-settings-root-account-app-sections-top.png`                       | claude_reference  | Settings root (top)                                  |
| 18  | `120-claude-ios-settings-root-appearance-theme-picker-logout.png`                 | claude_reference  | Settings root (scrolled)                             |
| 19  | `121-claude-ios-settings-profile-full-name-nickname-instructions.png`             | claude_reference  | Settings › Profile                                   |
| 20  | `122-claude-ios-settings-billing-account-plan-max-manage-subscription.png`        | claude_reference  | Settings › Billing                                   |
| 21  | `123-claude-ios-settings-usage-session-and-weekly-limits-fable.png`               | claude_reference  | Settings › Usage                                     |
| 22  | `124-claude-ios-settings-notifications-six-toggles-all-off.png`                   | claude_reference  | Settings › Notifications                             |
| 23  | `125-claude-ios-settings-privacy-data-privacy-train-models-toggle.png`            | claude_reference  | Settings › Privacy                                   |
| 24  | `126-claude-ios-settings-shared-links-empty-state-no-shared-links.png`            | claude_reference  | Settings › Shared links (empty)                      |
| 25  | `127-claude-ios-settings-capabilities-artifacts-code-exec-web-search-toggles.png` | claude_reference  | Settings › Capabilities (top)                        |
| 26  | `128-claude-ios-settings-capabilities-memory-and-tool-access-radio.png`           | claude_reference  | Settings › Capabilities (scrolled)                   |
| 27  | `129-claude-ios-settings-connectors-connector-discovery-toggle.png`               | claude_reference  | Settings › Connectors                                |
| 28  | `130-claude-ios-settings-permissions-location-calendar-reminders-health.png`      | claude_reference  | Settings › Permissions                               |
| 29  | `131-claude-ios-voice-settings-buttery-hands-free-mode.png`                       | claude_reference  | Settings › Voice settings                            |
| 30  | `claude-ios-cowork-01-cross-device-continuity-onboarding.png`                     | references-2      | Cowork cross-device announcement (variant B, "Beta") |
| 31  | `025-other-ios-settings-legal-links-claude-app-version-popover.png`               | chatgpt_reference | Settings root → legal/version popover                |

---

## Full navigation / settings tree (reconstructed)

```
Claude (iOS)
├── Nav drawer (hamburger, top-left on every top-level screen)
│   ├── "Claude" wordmark (serif logotype)
│   ├── Chats            [speech-bubble icon]
│   ├── Projects         [box/drawer icon]
│   ├── Artifacts        [interlocking-shapes icon]
│   ├── Code             [</> icon]
│   ├── Dispatch         [pager/beeper icon]
│   ├── Cowork           [checklist icon]
│   ├── — "Recents" —
│   │   └── up to 3 most-recent chat titles (no timestamps in drawer)
│   ├── user avatar (initial glyph, bottom-left)
│   └── "+ New chat" (bottom, black pill)
│
├── Chats  (top bar: hamburger · "Chats" · filter icon)
│   ├── chat row: title, relative "N ago" timestamp, chevron
│   ├── "+ New chat" floating button (bottom-right)
│   └── "Search" field (bottom, pill, magnifier icon)
│
├── Projects  (top bar: hamburger · "Projects" · filter icon)
│   ├── project row: title, relative time, chevron
│   ├── "+ New project" floating button
│   └── "Search" field (bottom)
│
├── Artifacts  (top bar: hamburger · "Artifacts")
│   └── empty state: icon, "No artifacts yet", "Artifacts Claude creates will appear here."
│
├── Code  (top bar: hamburger · "Code")
│   ├── "Devices" section
│   │   └── card: "No recently connected devices" (laptop+phone icon)
│   ├── empty state: mascot icon, "No sessions found.", "Your remote and remote control sessions will show up here."
│   └── "+ New session" floating button
│
├── Dispatch  (top bar: hamburger · "Dispatch")
│   ├── Intro: "Reach your desktop from your pocket"
│   │   ├── "✈ Email desktop app link" (outline button)
│   │   ├── "Pair with your desktop" (filled button)
│   │   └── safety disclaimer + "Learn how to use this safely" link
│   ├── → Setup steps: "Set up Dispatch on desktop first" (1-2-3 checklist) → "Done"
│   ├── → Pairing progress: "Looking for your desktop…"
│   └── → Pairing failed: "Pairing failed" (1-2-3 troubleshooting checklist) → "Try again"
│
├── Cowork  (top bar: hamburger · "Cowork" · history-clock icon · filter icon)
│   ├── Onboarding announcement (2 variants seen — see Caveats)
│   ├── Task list, grouped by day ("Today")
│   │   └── task row: checkbox, title, relative age
│   ├── "+ New task" floating button
│   ├── (from task composer) "Select mode" bottom sheet
│   │   ├── "Ask before acting" — "You'll confirm before anything changes."
│   │   └── "Act without asking" — "Claude works without pausing for approval."
│   ├── (from task composer) "Select model" bottom sheet
│   │   ├── Fable 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5 (radio list, each w/ optional subtitle)
│   │   ├── "Effort" → "Max" (drill-down)
│   │   └── "More models" (drill-down)
│   ├── (from task composer) "Add context" bottom sheet
│   │   ├── Camera tile
│   │   ├── Recent-photos tiles + "All photos" link
│   │   ├── "Add files" row
│   │   └── "Connectors" row (drill-down)
│   └── (history icon) → "Scheduled runs"
│       └── empty state: "No scheduled runs", "Runs from your scheduled tasks will show up here"
│
└── Settings  (modal sheet: X close · "Settings" · info "i" button)
    ├── info "i" → legal/version popover
    │   ├── "Claude v1.260709.0 (29067197451)"
    │   ├── Acceptable Use Policy ↗
    │   ├── Consumer Terms ↗
    │   ├── Privacy Policy ↗
    │   ├── Licenses (in-app doc icon)
    │   └── Help & Support ↗
    ├── account-email pill (display only)
    ├── "Account"
    │   ├── Profile → Full name, Nickname, Instructions (textarea), Delete account
    │   ├── Billing → Account plan, Manage subscription, Restore purchases
    │   ├── Usage → Current session %, Weekly limits (All models %, "Fable only" %)
    │   ├── Notifications → 6 toggles
    │   ├── Privacy → Data privacy (links), "Help improve our AI models" toggle
    │   └── Shared links → (empty state)
    ├── "App"
    │   ├── Capabilities
    │   │   ├── Artifacts (dependent toggle) / Code execution and file creation / Web search / Switch models when a message is flagged
    │   │   ├── "Search" → Search and reference chats
    │   │   ├── "Memory" → Generate memory from chat history, Memory from past chats (info row)
    │   │   └── "Tool access" → Auto / On demand / Always available (radio)
    │   ├── Connectors → Connector discovery toggle, "+" add button
    │   ├── Permissions → Location / Calendar / Reminders / Health (native-OS status, drill-down)
    │   ├── Voice → Voice settings (persona carousel, Language, Speed, Mode)
    │   └── Haptic feedback (toggle, sits with App section, not its own page)
    ├── "Appearance" → Light / Dark / System (3-up picker)
    └── "Log out" (destructive, red)
```

---

## Screen-by-screen detail

### 1. Onboarding — "Claude has memory" (file 103)

- Full-bleed illustration: two foreground white chat bubbles ("Can you remind me of everything I've accomplished this quarter?", "Have to write a very overdue self review…") over blurred/grayed background bubbles, implying "Claude recalls across many past chats."
- "New" pill badge (orange text on pale pink background).
- Serif headline: **"Claude has memory"**.
- Body copy: "Now Claude can make relevant connections across your chats. Memory includes your entire chat history with Claude. **About memory**" (hyperlink) then, as a separate line: "Manage memory in web settings." — i.e., the mobile app can enable/disable memory but management (presumably reviewing/editing what's remembered) is pushed to the web app, not built into iOS.
- Buttons: **"Use memory"** (black filled pill, primary) / **"Don't use memory"** (white outline pill, secondary).

### 2. Onboarding — Cowork cross-device, variant A (file 104)

- Top bar present (hamburger + "Cowork" title) — this variant renders as a full page, not a sheet.
- Illustration: hand-drawn orange yarn-ball/sun with a line-art hand tapping it.
- Serif headline: **"Keep Cowork going when you're on the go"**.
- Three benefit rows, each icon + sentence:
  - 📱 "Start and steer tasks directly from your phone."
  - 💻 "Check in from your phone, browser, or Claude desktop app."
  - ⚡ "Work continues in the background, even when you close the app."
- Single CTA: **"Get started"** (black pill).

### 2b. Onboarding — Cowork cross-device, variant B (references-2 file, "Beta")

- Rendered as a bottom sheet/modal over a composited background: an iOS notification preview ("Your daily brief task — Packed schedule today. Firsi[t at] 9am and a couple double boo[ked]…") stacked above a mock desktop browser chrome (traffic-light dots, tab labeled "Claude", address bar `claude.com/cowork`).
- X close button, top-left.
- **"Beta"** pill badge (present here, absent in variant A).
- Same headline, but reworded bullets with a different icon set (✓list / 🕐 / 🌐 instead of 📱/💻/⚡):
  - "Start and steer tasks directly from your phone."
  - "Check in from your phone, browser, or Claude desktop app."
  - "**Your** work continues in the background, even when you close the app." (adds "Your")
- Two CTAs instead of one: **"Start a Cowork task"** (black pill, primary) / **"Not now"** (outline, secondary).
- Reads as a different build/experiment of the same announcement — see Caveats.

### 3. Cowork task list (file 105)

- Top bar: hamburger · "Cowork" · a clock/history icon · a funnel/filter icon (both top-right).
- Section header **"Today"**.
- One task-card row: empty circle checkbox, title "LLM application reference documentat…" (truncated with ellipsis), trailing relative age "17h".
- Floating **"+ New task"** button, bottom-right, black pill.
- No filter or sort UI is expanded in this capture — icons imply the capability but their opened states are not covered by these captures.

### 4. Cowork — Select mode (file 106)

- Bottom sheet, drag handle, small orange starburst/sun glyph centered above the sheet (a recurring "Cowork" motif icon, distinct from the app's main orange asterisk logo).
- Back chevron on the dimmed background (top-left, outside sheet) + X close (inside sheet, top-left) — i.e., two dismiss affordances stacked.
- Title: **"Select mode"**.
- One grouped card, two rows, radio-style (single-select, blue checkmark):
  - **"Ask before acting"** (raised-hand icon) — "You'll confirm before anything changes." — **selected** in this capture.
  - **"Act without asking"** (fast-forward icon) — "Claude works without pausing for approval."
- This is the mobile equivalent of an agentic "permission mode" selector — same underlying concept as desktop/CLI approval modes, exposed here as a simple two-way binary rather than a granular per-tool permission list.

### 5. Cowork — Select model (file 107)

- Same sheet chrome/glyph as Select mode.
- Title: **"Select model"**.
- Grouped card, radio-style list:
  - **Fable 5** — no subtitle — **selected** (checkmark). _(Unverified name — see Caveats.)_
  - **Opus 4.8** — "For complex tasks"
  - **Sonnet 5** — "Most efficient for everyday tasks"
  - **Haiku 4.5** — "Fastest for quick answers"
- Below the card, two more drill-down rows in a second grouping:
  - **"Effort"** → current value **"Max"**, chevron (opens an effort-level picker not captured here).
  - **"More models"** → chevron (implies a longer list beyond the four headline tiers — not captured here).

### 6. Cowork — Add context (file 108)

- Sheet title **"Add context"**, right-aligned **"All photos"** link.
- Row of tiles: **Camera** (icon tile) then two photo thumbnails from the camera roll (in this particular capture, the two most-recent photos happen to be screenshots of the Select-model/Select-mode sheets themselves — camera-roll content, not extra controls).
- **"Add files"** row (upload icon).
- **"Connectors"** row (icon + chevron) — drill-down to connector picker, not captured here.
- No separate "paste text" or "voice memo" affordance is visible in this capture.

### 7. Cowork — Scheduled runs, empty (file 109)

- Back chevron + **"Scheduled runs"** title (reached via the clock/history icon on the Cowork task-list top bar).
- Empty-state icon: three-row checklist glyph (one checked).
- **"No scheduled runs"** / "Runs from your scheduled tasks will show up here".
- No CTA button on this empty state (contrast with Artifacts/Code empty states, which also have no CTA, vs. Chats/Projects which do).

### 8. Dispatch — Intro (file 110)

- Top bar: hamburger · **"Dispatch"**.
- Illustration: phone icon — dashed orange squiggle "connector" line — laptop icon. This exact three-part glyph (phone / squiggle / laptop) recurs across all four Dispatch screens, with the squiggle changing state (plain → red X) to indicate connection status.
- Serif headline: **"Reach your desktop from your pocket"**.
- Body: "Dispatch tasks to Claude and check in from your phone or computer — all in one seamless conversation."
- Two stacked buttons:
  - **"✈ Email desktop app link"** (outline pill, paper-airplane icon) — a secondary path that doesn't require live pairing.
  - **"Pair with your desktop"** (black filled pill) — primary path.
- Safety disclaimer directly under the buttons: "Claude will access your desktop to complete tasks you send from your phone. This may have security risks. Only pair devices you trust. **Learn how to use this safely**" (link).

### 9. Dispatch — Setup steps (file 111)

- Same top bar/illustration.
- Serif headline: **"Set up Dispatch on desktop first"**.
- Three numbered cards (1/2/3, circular badges):
  1. "Download the latest version of the Claude Desktop"
  2. "Sign in as **agiautomationllc@gmail.com**" (live account email interpolated into the instruction copy)
  3. "Go to the Dispatch tab on desktop and complete setup"
- Bottom CTA: **"Done"** (black pill, full width) — i.e., the mobile app doesn't detect completion automatically here; the user self-attests by tapping Done, which then presumably triggers the pairing-progress screen.

### 10. Dispatch — Pairing progress (file 112)

- Same top bar/illustration (neutral, unbroken squiggle).
- Serif headline: **"Looking for your desktop…"**.
- Body: "Make sure you have the Claude Desktop app installed, open, and signed in to your account."
- A small separate squiggle glyph below the body text, positioned as a loading/searching indicator (static in this single-frame capture; animation not observable).
- No cancel/back button is visible in this capture — only the drawer hamburger.

### 11. Dispatch — Pairing failed (file 113)

- Illustration variant: phone — dashed line broken by a **red circular X badge** — laptop (visually distinct failure state of the same three-part glyph).
- Serif headline: **"Pairing failed"**.
- Subhead: "A few things to check on your computer:"
- Three numbered troubleshooting cards:
  1. "Dispatch is set up in Claude Desktop"
  2. "You're signed in as **agiautomationllc@gmail.com**"
  3. "Claude Desktop is open and you have the latest version installed"
- Bottom CTA: **"Try again"** — rendered as an **outline** pill here (not filled black), visually distinct from the primary-path buttons on the other three Dispatch screens — a deliberate "this is a retry, not a fresh forward action" treatment.
- **Comparison note (per task instructions):** Dispatch's flow is a linear, single-purpose wizard (Intro → Setup checklist → Searching → Success/Fail) scoped to _one_ capability (remote-control your own paired desktop from the phone), with an explicit, upfront security disclaimer and a "Learn how to use this safely" education link before the user ever pairs. It does not expose session lists, history, or multi-device management inside this flow — that lives in the separate "Code" surface (see below), which is the more general remote/session registry. No file in this set shows a live/connected Dispatch session, so the in-session remote-control UI itself is **not covered by these captures**.

### 12. Code — sessions, empty (file 114)

- Top bar: hamburger · **"Code"**.
- "Devices" section header, one card: laptop+phone icon pair, **"No recently connected devices"**.
- Separate empty-state block lower on the page: small blocky/pixel-art orange mascot icon, **"No sessions found."**, "Your remote and remote control sessions will show up here."
- Floating **"+ New session"** button, bottom-right.
- This "Code" surface's empty-state copy ("remote and remote control sessions") strongly implies it is the same underlying remote-session mechanism Dispatch uses, generalized to also list coding-agent sessions — i.e., Code and Dispatch likely share a session/pairing backend, surfaced as two different front-ends (a general session list here vs. a guided single-purpose wizard in Dispatch).

### 13. Artifacts, empty (file 115)

- Top bar: hamburger · **"Artifacts"**.
- Empty-state icon: two overlapping rounded-square/link shapes.
- **"No artifacts yet"** / "Artifacts Claude creates will appear here."
- No floating action button (artifacts are created from chat, not from this screen directly).

### 14. Projects list (file 116)

- Top bar: hamburger · **"Projects"** · filter/funnel icon.
- One row: **"How to use Claude"**, "2 weeks ago", chevron — reads as a seeded/default onboarding project rather than a user-created one.
- Floating **"+ New project"** button.
- Bottom **"Search"** pill field.

### 15. Chats list (file 117)

- Top bar: hamburger · **"Chats"** · filter/funnel icon.
- Three rows, each title + relative time + chevron:
  - "Greeting" — 1 day ago
  - "how much time it will take wit…" — 5 months ago (truncated)
  - "Evaluate my coding style based on a snippet" — 5 months ago
- Floating **"+ New chat"** button.
- Bottom **"Search"** pill field.

### 16. Nav drawer (file 118)

- Serif **"Claude"** wordmark at top (no logo mark next to it in the drawer itself).
- Primary nav list, icon + label, "Chats" shown in a selected/highlighted pill state:
  - Chats (speech bubble)
  - Projects (box)
  - Artifacts (interlocking shapes)
  - Code (`</>`)
  - Dispatch (pager-like glyph)
  - Cowork (checklist glyph)
- **"Recents"** section header, then up to 3 most-recent chat titles (title only, no timestamp, no chevron — tapping presumably opens the chat).
- Footer row: circular avatar with user initial ("S"), **"+ New chat"** pill button.
- The drawer partially overlays the underlying Chats list (visible sliver on the right edge of the screenshot), confirming this is a slide-over panel, not a separate screen.

### 17–18. Settings root (files 119, 120 — two scroll positions of one screen)

- Modal sheet chrome: **X** close (top-left), **"Settings"** title (center), **"i"** info button (top-right) — the info button opens the legal/version popover (see file 025 below).
- Non-interactive pill showing the signed-in email: `agiautomationllc@gmail.com`.
- **"Account"** section (grouped card, chevron rows):
  - Profile
  - Billing — trailing value **"Max plan"** shown inline on the row itself (only settings-root row with a visible trailing value besides the section header)
  - Usage
  - Notifications
  - Privacy
  - Shared links
- **"App"** section (grouped card):
  - Capabilities
  - Connectors
  - Permissions
  - Voice
  - Haptic feedback — **toggle, ON** (only toggle control that lives directly on the Settings root rather than behind a drill-down)
- **"Appearance"** section — three-up visual picker, each a small mock-screen thumbnail with a label:
  - **Light** (selected in this capture — blue outline ring)
  - **Dark**
  - **System** (thumbnail rendered half-light/half-dark to signal "follows OS")
- **"Log out"** — red text, door/exit icon, own row below the Appearance card (not grouped inside a card with anything else).

### 19. Legal / version popover (file 025-other-ios…, triggered from Settings' "i" button)

- Rendered as a popover anchored to the top-right info button, arrow pointing at it, overlaying the Settings list behind it.
- Version string at top: **"Claude v1.260709.0 (29067197451)"** — the dotted version segment (`260709`) reads as a `YYMMDD`-style build date (2026-07-09), i.e. this build is dated after the memory said "today" is 2026-08-15, consistent with these being slightly-earlier captures.
- Divider, then a list of external/document links, each with a leading icon:
  - **Acceptable Use Policy** ↗ (external-link icon)
  - **Consumer Terms** ↗
  - **Privacy Policy** ↗
  - **Licenses** (document icon, not the external-link arrow — implies this one opens an in-app text viewer rather than a browser)
  - divider
  - **Help & Support** ↗

### 20. Settings › Profile (file 121)

- Back chevron, **"Profile"** title, a checkmark button top-right (save/confirm affordance, shown in a dimmed/gray state here — likely disabled until a field is edited).
- Card: **"Full name"** (value "Siddhartha"), divider, **"Nickname"** (value "Siddhartha").
- Caption: "Claude calls you by your nickname in chat." — clarifies the full-name/nickname distinction exists specifically because the nickname is what's used in-conversation.
- **"Instructions"** label, then a large tappable field with placeholder text **"How you'd like Claude to respond"** (empty in this capture — no custom instructions set).
- Caption: "Your instructions will apply to all conversations, within **Anthropic's guidelines**." (hyperlinked).
- Separate card, single destructive row: **"Delete account"** (trash icon, red text).

### 21. Settings › Billing (file 122)

- Back chevron, **"Billing"** title.
- Row: **"Account plan"** — value **"Max"** (no chevron on this specific row — it's a static display of current plan, unlike most other Settings rows).
- Card: **"Manage subscription"** (dollar-sign icon), divider, **"Restore purchases"** (circular-arrow icon).
- No in-app plan comparison, upgrade/downgrade picker, or price display on this screen — billing management is delegated out (to the App Store subscription-management sheet, standard for iOS IAP), and "Restore purchases" is the standard IAP-recovery affordance. No usage-based/credit-purchase UI is visible here (contrast with the web/desktop billing surfaces this audit likely also covers elsewhere).

### 22. Settings › Usage (file 123)

- Back chevron, **"Usage"** title, "i" info icon top-right (likely opens an explainer popover, not captured).
- Card: **"Current session"** — **"2% used"**, thin progress bar (small blue segment near the start), caption **"Resets in 4 hr 28 min"**.
- **"Weekly limits"** section header.
- Card, two rows:
  - **"All models"** — **"83% used"**, amber/orange progress bar, caption "Resets Sat 9:59 AM"
  - **"Fable only"** — **"100% used"**, red/full progress bar, caption "Resets Sat 9:59 AM"
- Design note: progress-bar color communicates severity (blue/neutral at low usage → amber in the 80s% → red at 100%), and the weekly section splits an aggregate "All models" cap from a **named-model-specific** sub-cap ("Fable only") — implying the default/flagship model has its own separate weekly quota distinct from the pooled cross-model quota. This two-tier quota structure (session cap + pooled weekly cap + flagship-model-specific weekly cap) is a capability a backend/entitlements system would need to support; it is not something inferable from web pricing pages alone.

### 23. Settings › Notifications (file 124)

- Back chevron, **"Notifications"** title.
- One grouped card, six toggle rows — **all OFF** in this capture (gray track, knob left):
  1. **"Research complete"** — "Get notified when research completes"
  2. **"Chat responses"** — "Get notified when chat completes"
  3. **"Code updates"** — "Get notified when Code sessions have updates"
  4. **"Code permission requests"** — "Get notified when Code sessions need your approval to use a tool"
  5. **"Dispatch messages"** — "Get notified when Claude messages you in Dispatch."
  6. **"Product updates"** — "Get notified about new features, tips, and occasional promotions"
- Notably granular: notifications are broken out per-surface (Research, Chat, Code ×2, Dispatch, marketing) rather than one master toggle — "Code permission requests" in particular confirms Code sessions have an approval-gated tool-use model that can interrupt the user via push notification, mirroring the Cowork "Ask before acting" mode concept but for the Code surface specifically.

### 24. Settings › Privacy (file 125)

- Back chevron, **"Privacy"** title.
- Card 1: **"Data privacy"** — body text: "Anthropic believes in transparent data practices. Keeping your data safe is a priority. Learn how your information is protected when using Anthropic products, and visit our **Privacy Center** and **Privacy Policy** for more details." (both hyperlinked).
- Card 2: **"Help improve our AI models"** — body: "Allow the use of your chats and coding sessions to train and improve Anthropic AI models. **Learn More**" — toggle, **OFF**.
- Only two controls on this screen; no separate "export data" or "delete data" self-service action here (contrast likely present on desktop/web settings, not covered by this file set).

### 25. Settings › Shared links, empty (file 126)

- Back chevron, **"Shared links"** title.
- Empty state: link/chain icon, **"No shared links"**, "Share a chat to create a link."

### 26–27. Settings › Capabilities (files 127, 128 — one scrollable screen, two scroll positions)

- Back chevron, **"Capabilities"** title.
- First card, four toggle rows:
  1. **"Artifacts"** — toggle rendered **ON but visually pale/dimmed** (distinct styling from a normal active toggle) — caption **"Required by code execution"**. This reads as a _locked-on dependent_ toggle: it can't be independently turned off while Code execution is enabled, since Artifacts is a prerequisite capability.
  2. **"Code execution and file creation"** — toggle ON — caption: "Allow Claude to execute code and create and edit docs, spreadsheets, presentations, PDFs, and data reports." (confirms this single toggle gates code execution _and_ Office-style document generation together, not two separate switches).
  3. **"Web search"** — toggle ON — caption: "Claude will automatically search the web when it determines it needs current information" (i.e., search is agentic/automatic, not a manual per-message toggle).
  4. **"Switch models when a message is flagged"** — toggle ON — caption: "When safety measures flag a message, automatically switch to a different model to keep chatting. When off, your chat will pause instead." — this directly documents a safety-routing behavior: flagged messages get silently rerouted to a different model unless the user opts out, in which case the conversation pauses instead of continuing.
- **"Search"** section: **"Search and reference chats"** — toggle **OFF** — caption: "Allow Claude to search for relevant details in past chats. Learn more." (distinct from "Web search" above — this is cross-chat retrieval, not internet search).
- **"Memory"** section: **"Generate memory from chat history"** — toggle **ON** — divider — **"Memory from past chats"** row with no toggle, just informational text below the card: "Starts fresh and learns from your conversations." (i.e. this row is a placeholder that will populate with actual remembered facts once available — not observed populated in any capture here).
- **"Tool access"** section — radio-style, three options, single-select:
  - **"Auto"** — "Claude chooses for you" — **selected**
  - **"On demand"** — "Load when needed. More messages, lower accuracy"
  - **"Always available"** — "Ready from start. Fewer messages, better accuracy"
  - This is a tool-loading/latency-vs-accuracy tradeoff control that is not documented in public web pricing/help content — it exposes that tool definitions consume context and the app lets the user trade "more messages before hitting limits" against "better first-attempt tool-use accuracy."

### 28. Settings › Connectors (file 129)

- Back chevron, **"Connectors"** title, **"+"** add button top-right.
- Single card: **"Connector discovery"** (icon) — toggle **OFF** — caption: "Claude will help you find available connectors in your directory."
- No connected-connector rows are shown in this capture (base/empty state) — the actual connector list/marketplace behind "+" is **not covered by these captures**.

### 29. Settings › Permissions (file 130)

- Back chevron, **"Permissions"** title.
- One card, four rows, each with a native-style app icon, label, current status value (right-aligned), and chevron:
  1. **Location** (compass icon) — **"Allowed"**
  2. **Calendar** (red calendar icon) — **"Read & write"**
  3. **Reminders** (list icon) — **"Read & write"**
  4. **Health** (heart icon) — **"Never"**
- These four rows read as an in-app _summary/deep-link_ surface into iOS's own per-app permission settings — the status vocabulary ("Allowed," "Read & write," "Never") matches iOS's native permission-state language rather than a Claude-authored one, and tapping a row almost certainly routes to the system Settings app's permission screen for that data type (standard iOS pattern for apps that can't toggle these permissions themselves in-app). This confirms Claude iOS integrates with Health, Calendar, Reminders, and Location as native data sources/sinks the assistant can be granted access to — a capability with no web-app equivalent and not discoverable from web documentation.

### 30. Settings › Voice settings (file 131)

- Back chevron, **"Voice settings"** title.
- Horizontal card carousel of voice personas: **"Buttery"** fully visible/centered (selected), **"Airy"** partially visible at the right edge, with **5 page dots** total (only the first is filled) — confirming 5 named voice options exist, only 2 named/partially visible in this evidence set. The other 3 names are **not covered by these captures**.
- Row: **"Language"** with a **"Beta"** pill badge — value **"English"**, dropdown chevron.
- Row: **"Speed"** — value **"Normal"**, dropdown chevron.
- **"Mode"** section header, radio-style, two options:
  - **"Hands free"** — "Best for quiet environments" — **selected**
  - **"Push to talk"** — "Hold to speak, release to send"
- Design note: "Hands free" mode is explicitly scoped as _quiet-environment-only_ in its own subtitle, implying the always-listening/no-tap voice mode has a known limitation around ambient noise that the product surfaces proactively rather than letting the user discover it by trial.

---

## Control inventory table

| Screen                  | Control                                                                                                              | Type                                   | What it appears to do                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| Nav drawer              | Chats / Projects / Artifacts / Code / Dispatch / Cowork                                                              | Nav list item                          | Switches top-level surface                                                      |
| Nav drawer              | Recents row (×3)                                                                                                     | List row                               | Opens that chat                                                                 |
| Nav drawer              | Avatar (initial)                                                                                                     | Icon button                            | Presumed opens Settings (confirmed by Settings sheet appearing elsewhere)       |
| Nav drawer              | "+ New chat"                                                                                                         | Pill button                            | Starts a new chat                                                               |
| Chats / Projects        | Filter (funnel) icon                                                                                                 | Icon button                            | Opens filter/sort options (not captured open)                                   |
| Chats / Projects        | "+ New chat" / "+ New project"                                                                                       | Floating pill button                   | Creates new item                                                                |
| Chats / Projects        | "Search" field                                                                                                       | Text input                             | Searches list                                                                   |
| Code                    | "+ New session"                                                                                                      | Floating pill button                   | Starts new remote/code session                                                  |
| Cowork task list        | History-clock icon                                                                                                   | Icon button                            | Opens "Scheduled runs"                                                          |
| Cowork task list        | Filter icon                                                                                                          | Icon button                            | Opens filter (not captured open)                                                |
| Cowork task list        | Task row checkbox                                                                                                    | Checkbox                               | Marks/opens task (state not captured mid-toggle)                                |
| Cowork task list        | "+ New task"                                                                                                         | Floating pill button                   | Starts new Cowork task                                                          |
| Cowork onboarding (A)   | "Get started"                                                                                                        | Pill button                            | Dismisses/advances onboarding                                                   |
| Cowork onboarding (B)   | "Start a Cowork task" / "Not now"                                                                                    | Pill buttons                           | Advances to task creation / dismisses                                           |
| Select mode sheet       | "Ask before acting" / "Act without asking"                                                                           | Radio row                              | Sets Cowork task's approval mode                                                |
| Select model sheet      | Fable 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5                                                                            | Radio row                              | Chooses model for the task                                                      |
| Select model sheet      | "Effort" → "Max"                                                                                                     | Drill-down row                         | Opens effort-level picker                                                       |
| Select model sheet      | "More models"                                                                                                        | Drill-down row                         | Opens extended model list                                                       |
| Add context sheet       | Camera tile                                                                                                          | Tile button                            | Opens camera capture                                                            |
| Add context sheet       | Photo thumbnails / "All photos"                                                                                      | Tile / link                            | Attaches a recent photo / opens full photo picker                               |
| Add context sheet       | "Add files"                                                                                                          | Row                                    | Opens file picker                                                               |
| Add context sheet       | "Connectors"                                                                                                         | Drill-down row                         | Opens connector picker                                                          |
| Dispatch intro          | "Email desktop app link"                                                                                             | Outline pill button                    | Sends install link via email                                                    |
| Dispatch intro          | "Pair with your desktop"                                                                                             | Filled pill button                     | Starts pairing flow                                                             |
| Dispatch intro          | "Learn how to use this safely"                                                                                       | Text link                              | Opens safety help content                                                       |
| Dispatch setup          | "Done"                                                                                                               | Filled pill button                     | Confirms desktop setup complete, advances to pairing                            |
| Dispatch pairing-failed | "Try again"                                                                                                          | Outline pill button                    | Retries pairing search                                                          |
| Settings root           | Profile / Billing / Usage / Notifications / Privacy / Shared links / Capabilities / Connectors / Permissions / Voice | Drill-down row                         | Opens respective sub-screen                                                     |
| Settings root           | "Haptic feedback"                                                                                                    | Toggle                                 | Enables/disables haptics app-wide                                               |
| Settings root           | Light / Dark / System                                                                                                | Selectable tile (radio)                | Sets app theme                                                                  |
| Settings root           | "Log out"                                                                                                            | Destructive row                        | Signs the user out                                                              |
| Settings root           | "i" info button                                                                                                      | Icon button                            | Opens legal/version popover                                                     |
| Legal popover           | Acceptable Use Policy / Consumer Terms / Privacy Policy / Help & Support                                             | External link row                      | Opens policy page in browser                                                    |
| Legal popover           | Licenses                                                                                                             | In-app doc row                         | Opens license text in-app                                                       |
| Profile                 | Full name / Nickname                                                                                                 | Text field                             | Edits display identity                                                          |
| Profile                 | Instructions textarea                                                                                                | Text field                             | Sets standing custom instructions                                               |
| Profile                 | Checkmark (top-right)                                                                                                | Icon button                            | Saves profile edits                                                             |
| Profile                 | "Delete account"                                                                                                     | Destructive row                        | Starts account deletion                                                         |
| Billing                 | "Manage subscription"                                                                                                | Row                                    | Opens App Store subscription management                                         |
| Billing                 | "Restore purchases"                                                                                                  | Row                                    | Re-syncs IAP entitlement                                                        |
| Notifications           | 6 toggles (Research/Chat/Code updates/Code permission/Dispatch/Product)                                              | Toggle                                 | Enables/disables that push-notification category                                |
| Privacy                 | "Help improve our AI models"                                                                                         | Toggle                                 | Opts chats/coding sessions into model training                                  |
| Capabilities            | Artifacts (dependent)                                                                                                | Toggle (locked-appearance)             | Enables Artifacts rendering; forced on while code exec is on                    |
| Capabilities            | "Code execution and file creation"                                                                                   | Toggle                                 | Enables code execution + doc/sheet/slide/PDF creation                           |
| Capabilities            | "Web search"                                                                                                         | Toggle                                 | Enables agentic web search                                                      |
| Capabilities            | "Switch models when a message is flagged"                                                                            | Toggle                                 | Auto-reroutes flagged messages instead of pausing chat                          |
| Capabilities            | "Search and reference chats"                                                                                         | Toggle                                 | Enables retrieval across past chats                                             |
| Capabilities            | "Generate memory from chat history"                                                                                  | Toggle                                 | Enables memory generation                                                       |
| Capabilities            | Auto / On demand / Always available                                                                                  | Radio row                              | Sets tool-loading strategy (latency vs. accuracy tradeoff)                      |
| Connectors              | "Connector discovery"                                                                                                | Toggle                                 | Lets Claude surface directory connectors proactively                            |
| Connectors              | "+" (top-right)                                                                                                      | Icon button                            | Adds a connector                                                                |
| Permissions             | Location / Calendar / Reminders / Health                                                                             | Drill-down row (native-status display) | Deep-links to iOS's own per-permission settings                                 |
| Voice settings          | Persona carousel (Buttery, Airy, …)                                                                                  | Swipeable card select                  | Chooses TTS voice persona                                                       |
| Voice settings          | "Language" (Beta)                                                                                                    | Dropdown row                           | Sets recognition/response language                                              |
| Voice settings          | "Speed"                                                                                                              | Dropdown row                           | Sets voice playback speed                                                       |
| Voice settings          | "Hands free" / "Push to talk"                                                                                        | Radio row                              | Sets voice-input interaction mode                                               |
| Usage                   | (read-only) session/weekly progress bars                                                                             | Progress indicator                     | Shows consumption against session, all-model-weekly, and Fable-only-weekly caps |

---

## Notable design decisions

- **Sheets, not full pages, for in-task pickers.** Select mode, Select model, and Add context are all bottom sheets launched from within a Cowork task composer, each with its own X-close and a small recurring orange starburst glyph — a consistent "in-context configuration" pattern distinct from the full-page top-level surfaces (Chats, Cowork, Dispatch, Code, Artifacts).
- **Two dismiss affordances stacked on the Select-mode/Select-model sheets** (a back chevron on the dimmed background behind the sheet, plus an X inside the sheet) — likely because the sheet can be reached from more than one entry point (task composer directly, or via Add-context), so "back" and "close" are kept distinct.
- **Settings is a modal sheet with rounded top corners and an X, not a nav-drawer destination** — it's reached differently from Chats/Projects/Artifacts/Code/Dispatch/Cowork (which live in the drawer) and is dismissed with X rather than a back chevron, signaling it's treated as an overlay/utility surface rather than a peer top-level surface, even though the avatar that opens it lives in the same drawer.
- **Progressive disclosure via section headers, not tabs.** Every settings sub-screen groups related toggles/rows under small gray uppercase-style section labels ("Search", "Memory", "Tool access", "Weekly limits", "Mode") inside otherwise flat scrolling lists — no secondary tab bars anywhere in this set.
- **Severity-coded progress bars.** Usage bars shift color (blue-ish → amber → red) as consumption rises, giving an at-a-glance urgency signal beyond the percentage text — a design decision that would need a backend that returns not just a percentage but is paired with client-side (or server-side) thresholding logic.
- **Dependent/locked toggles are shown, not hidden.** Rather than hiding the "Artifacts" toggle when Code execution forces it on, the app keeps it visible but visually dimmed with an explanatory caption ("Required by code execution") — transparency over simplicity.
- **Retry buttons are visually demoted.** Both Dispatch's "Try again" and (implicitly) other failure-state CTAs use an outline style rather than the filled-black primary style used for forward-progress actions elsewhere — a consistent "this is a repair action, not a new commitment" visual grammar.
- **Native OS permission rows instead of custom toggles for Health/Calendar/Reminders/Location.** Rather than re-implementing permission grant UI, Claude's Permissions screen shows the current OS-reported state and (presumably) deep-links out to iOS Settings — respecting the platform's canonical permission ownership rather than shadowing it.
- **Two visibly different Cowork-onboarding builds captured** (see Caveats) suggest this announcement/onboarding surface was actively iterated on (copy, icon set, CTA count, "Beta" labeling) — evidence of a feature still being tuned rather than long-settled.

## Capabilities visible only from these screenshots (not discoverable from web docs)

- **Cowork tasks carry a persistent, per-task approval-mode setting** ("Ask before acting" vs "Act without asking") selected at task-creation time via a dedicated modal — this is a first-class, user-facing agent-autonomy control, not just an internal safety default.
- **A model-loading/accuracy tradeoff exists for tools** ("Auto" / "On demand" / "Always available" under Capabilities → Tool access), explicitly described as trading message-count budget against tool-use accuracy — implies context-window/tool-definition cost is a real, user-visible constraint the product surfaces as a setting rather than hiding.
- **Flagged messages get silently model-switched by default**, with an explicit opt-out that instead pauses the chat ("Switch models when a message is flagged") — a concrete, user-controllable safety-routing mechanism.
- **Weekly usage caps are split per default-model**, not just pooled across all models ("All models" 83% vs. "Fable only" 100%, both resetting Saturday 9:59 AM) — a two-tier quota entitlement structure a backend must track and enforce per-model as well as in aggregate.
- **Code sessions have their own push-notification category for tool-permission requests** ("Code permission requests" — "Get notified when Code sessions need your approval to use a tool"), confirming Code sessions can run semi-autonomously and interrupt the user asynchronously for approval, mirroring Cowork's "Ask before acting" concept on a different surface.
- **Dispatch and Code likely share a session/pairing backend**: Code's empty-state copy explicitly says "Your remote and remote control sessions will show up here," and Notifications includes both "Code updates"/"Code permission requests" and a separate "Dispatch messages" category — implying related but distinct session types funneled through overlapping infrastructure.
- **Voice has a named, per-persona "hands-free" limitation** surfaced directly in the UI ("Best for quiet environments"), rather than left as an unstated quality caveat.
- **Connector discovery is opt-in and off by default** in this capture ("Claude will help you find available connectors in your directory" — toggle OFF), implying a directory-driven connector recommendation engine exists behind this toggle that isn't otherwise described in these captures.
- **In-app build/version strings are date-coded** (`v1.260709.0`), useful for correlating any given screenshot set to an approximate build date when other evidence is ambiguous.

## Files not opened / out of assigned scope

None — all 31 matching files across the three directories were located and opened. No `claude-ios-*` or `other-ios-*` file was skipped.
