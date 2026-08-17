# Claude Desktop + Claude Code VS Code Extension — Screenshot Evidence

**Scope of this document:** every file matching `claude-desktop-*` or `claude-code-vscode-ext-*` across the three reference directories. 39 files total, all opened and inspected visually with the Read tool (not inferred from filenames).

- `references-2/`: 9 files — `claude-desktop-cowork-record-skill-01..09-*.png`
- `claude_reference/`: 30 files — `098..102-claude-desktop-cowork-agent-task-view-*.png`, `132..135-claude-code-vscode-ext-*.png`, `136..156-claude-desktop-*.png`
- `chatgpt_reference/`: 0 matching files

## Caveats (read before using this as ground truth)

- **Point-in-time captures of unknown provenance.** File mtimes cluster Jul 20–23, 2026 (per `ls -la`), roughly 3–4 weeks before this audit's date (2026-08-15). Anthropic ships fast; some copy/toggles may already have moved.
- **Several features are explicitly labeled Beta in-product**: Dispatch, Claude in Chrome, Computer use, Claude in Chrome site permissions. Treat these as pre-GA and volatile.
- **"Fable 5"** appears repeatedly as a model name (in the model picker, in a promo banner "Fable 5 is now a standard part of your Max plan," and in Usage as a per-model weekly cap). This is unfamiliar relative to Anthropic's known public model line — it may be an internal/codename, an experiment-flag artifact of this particular captured account, or a build the capturing account had special access to. **Flagging, not asserting** — do not treat "Fable 5" as a confirmed public model ID.
- **The VS Code extension screenshots are not stock VS Code.** The title bar reads "extension-vscode — Claude Code" and the bottom-right status bar reads "Antigravity - Settings" — this is Google's Antigravity IDE (a VS Code fork), with the Claude Code extension installed inside it. The top toolbar also shows a second, non-Claude squiggle-icon extension button next to the Claude Code icon — evidence that this environment runs multiple AI coding extensions side-by-side. Settings tabs correspondingly show "User / Workspace / **Antigravity IDE Settings**," not vanilla VS Code's "User / Workspace / Remote."
- Never invented: I did not see and am not reporting a mobile Dispatch flow, a Skills library browser, a Connectors picker, or a Plugins browser in this set — those exist as menu entries/links but their destination screens are **not covered by these captures** (they belong to the iOS/web-settings surfaces captured elsewhere, per the sibling files in `claude_reference/103-131` and `157-183`, which are outside this assignment).
- Screenshot resolution is 2940×1912 native (displayed ~2000×1301); all reads were done at full visual fidelity, not thumbnail.

---

## Part 1 — Cowork Agent Task View (the primary benchmark for agentic-work surfaces)

Source: `claude_reference/098-102`, task "LLM application reference documentation," Home tab, task detail view (not a modal — a full-width task screen with a right-hand rail).

### Layout shape

Three-column layout inside the task screen:

1. **Left global nav** (persistent app sidebar): Home/Code toggle tabs, `+ New`, Projects, Artifacts, Scheduled, Dispatch (Beta badge), Customize, then a "Recents" list of prior chats/tasks (icons differ: chat-bubble for chats, a checklist-with-dot icon for Cowork tasks), then Design (Labs badge) and account row at the very bottom.
2. **Center transcript**: task title in header ("LLM application reference documentation") with a cloud icon and a chevron (dropdown — presumably to rename/switch/export the task), followed by a scrolling tool-call timeline connected by a thin vertical line, and a persistent composer pinned to the bottom.
3. **Right rail**: three collapsible sections — **Progress**, **Outputs**, **Context** — each with a `>` / `⌄` disclosure chevron.

### The tool-call timeline (098–100)

Each tool invocation renders as one row: a small type-specific icon, a short human-readable label, and (once complete) an elapsed-time stamp. Observed row types and their exact labels:

- `🔍 Found tools` — expands into a code-style card with **Request** and **Response** sub-blocks, e.g. `{ "max_results": 5, "query": "select:TaskCreate,TaskUpdate,WebSearch,WebFetch" }` — this is a live view into the tool-search/tool-discovery mechanism, not just "Claude used a tool."
- `⊠ Summarize top two levels of folder listing JSON`
- `📖 Reading files on your computer`
- `⊠ Extract docs/ subtree from saved folder listing`
- `📄 Read Folder instructions (CLAUDE.md)` — note: this literally reads the target repo's own `CLAUDE.md`, i.e. Claude is shown discovering and honoring project-level agent instructions live, on screen.
- `📄 Read README.md`
- `📄 Read PRODUCT.md`
- `📁 Listing files on your computer`
- `📄 Read REFERENCE_STRUCTURE.md`
- `⊠ List headings of REFERENCE_INDEX.md`
- `🔑 Send message` (in screen 102, twice, during a longer run)

A running rollup line sits above the timeline and updates as it goes: `"Used 4 tools, read 3 files, ran 2 commands"` → later `"Read 4 files, used 4 tools, ran 3 commands"`.

Terminal/current-status line at the bottom of the timeline animates between:

- `🌸 Working on your computer… 2m 16s` (orange starburst spinner, denser rays)
- `💥 Working through a complex response… 2m 30s` / `…2m 48s` (a different spinner glyph — the product appears to swap the status icon/copy based on what phase of work it's in, not just show a generic spinner)

A floating circular **↓ scroll-to-bottom** button appears mid-scroll (099) — auto-scroll affordance for a long-running agent transcript.

### Skip-approvals safety banner (098)

Persistent warning banner above the composer while a Cowork task is running unattended:

> **"Skip all approvals is on.** Claude never pauses, even for unsafe actions. This includes using your connectors and apps on your computer. You can turn off individual connectors in the **+** menu. **See safe use tips**" — with an inline X to dismiss.

This is a standing, non-modal risk disclosure — it stays visible for the duration of the session, not just a one-time toast.

### Right rail in detail (101–102)

- **Progress** (collapsed → expanded): expanded state shows a **numbered stepper list**, each item a circle with a number, title text, and (for the active step) a blue-outlined circle to mark "current." Example real content captured:
  1. Researching ChatGPT/Claude benchmark surfaces _(active — blue ring)_
  2. Define master spec template and doc-set architecture
  3. Write Website benchmark spec (ChatGPT Web / Claude.ai)
  4. Write Desktop benchmark spec (Local+BYOK vs Cloud modes)
  5. Write Mobile benchmark spec (Local vs Cloud modes, no BYOK)
  6. Write CLI benchmark spec (Local LLM / BYOK / Subscription modes)
  7. Write VS Code extension benchmark spec
     Collapsed state instead shows a minimal 3-dot progress indicator (✓–✓–○) plus caption "See task progress for longer tasks."
- **Outputs**: collapsed shows a small bar-chart-in-a-box icon with caption "View and open files created during this task." (No files had been produced yet in the captured moment, so the expanded contents of Outputs are **not covered by these captures**.)
- **Context**: shows the attached folder as a chip, e.g. `📁 agiworkforce`, plus a "Connectors" sub-list showing individually attached connector chips, e.g. `🌐 Web Search`. Two small icons top-right of the Context header — a folder-with-plus and a laptop icon — are presumably "add folder" and "add from this device" affordances. Caption under Context in the record-skill flow's task view (screen 06, Part 2) reads: "Track tools and referenced files used in this task."

### Folder-access permission modal (102)

A native-feeling modal interrupts an otherwise unattended Cowork session to ask for filesystem scope, even with "skip approvals" seemingly active elsewhere in the flow — i.e., first-time folder grants are NOT skipped by "Skip all approvals," only subsequent actions inside already-granted folders are:

> **"Allow this Cowork session to access these 4 folders?"**
> (lists 4 absolute paths under `/Users/siddhartha/Downloads/...`)
> "Claude will be able to read and modify files here, and run commands that access these folders, for the current session."
> ☐ **Don't ask again for these folders on this device**
> **[Cancel]** **[Allow]**

Behind the modal: a "✓ Done" status line and `"You've hit your session limit · resets 12:40am (UTC)"` — showing that session-limit exhaustion is reported inline in the transcript itself, not just in a separate usage page.

The composer at this point shows **attached-file chips** stacked above the text field (`claude-client-architecture-spec-...`, `claude_parity_reference_july_2026`, `agiworkforce-implementation-pack`, `claude_six_surfaces_inventory_b...`) — confirming file attachments render as removable pill chips directly above the input, and the send button turns solid orange with a spinner ring while the task is actively running (vs. a plain white square icon at idle).

---

## Part 2 — Cowork "Record a Skill" flow (9 screens, full step-by-step)

Source: `references-2/claude-desktop-cowork-record-skill-01..09`. This is a screen-recording-to-skill capture pipeline, reachable from the composer's `+` menu.

### Step 1 — Cross-device onboarding teaser (01)

A one-time (Beta-badged) promo modal, not part of the recording flow itself but gating discovery of Cowork/Dispatch generally:

> **"Pick up your Cowork tasks from anywhere"** _(Beta badge)_
> "Kick off a task in the desktop app, and keep running with it from your phone or the web. Claude keeps working even when your computer is off."
> **[Start a new task]** (primary button)
> Right half of the modal shows a live mock of a phone notification card ("Your daily brief task — Packed schedule today, 9am and a couple dou[ble bookings]") layered over a cropped preview of the desktop composer (Chat/Cowork toggle visible). Dismiss via X top-right.

### Step 2 — Composer `+` → Add menu (02)

From the home screen ("🌸 Clocking in for the evening shift." — a time-of-day-flavored greeting, confirming the greeting text rotates), with **Cowork** mode selected, the `+` button opens a menu:

- **Add files or photos** (paperclip icon) — shortcut `⌘U`
- **Record a skill** (video-camera icon)
  — divider —
- **Skills** (submenu chevron)
- **Connectors** (submenu chevron)
- **Add plugins…**

"Record a skill" sits as a first-class peer to file attachment, not buried in a settings menu — it's one click from the main composer.

### Step 3 — Privacy consent modal (03)

Clicking "Record a skill" opens a consent modal before any capture starts:

> 🎥 **"Record a skill"**
> "Your screen, clicks, typing, and voice are recorded, then sent to Claude and turned into a repeatable skill."
> ⚠️ (amber/olive warning box, lock icon) **"Don't type passwords or secrets, or display sensitive information or private conversations while recording."**
> **[Cancel]** **[Start recording]** (primary, white) — plus a separate split mic-source button (mic icon + chevron) next to Start recording, implying a selectable audio input device.

### Step 4 — Active capture, zero steps (04)

Once recording starts, the **entire desktop is taken over by a full-bleed black overlay** with a warm amber/orange vignette glow bleeding in from all four edges (a clear "you are being recorded" visual treatment, similar to macOS screen-recording halos). A floating pill control sits bottom-center:

> 🔴 **Capturing · 0 steps** | 🎤 (mic level meter) | **[Discard]** **[Done]**

"0 steps" implies the tool is counting discrete recognized user actions (clicks/keystrokes/app switches) live as a step counter, not just elapsed time.

### Step 5 — Processing, zero steps (05)

After clicking Done, control returns to the normal desktop/app view (home screen again visible behind), and the capture pill switches to:

> ⏳ **Processing · 0 steps** | 🎤

Still bottom-center floating, same pill shape, spinner replacing the red dot.

### Step 6 — New task opens: progress / outputs / context (06)

Processing resolves into a **new task thread**, titled **"Recorded demonstration (9.9s)"** (cloud icon + chevron in the header, same pattern as Part 1's task header). Claude's first message: _"I recorded a demonstration of a desktop workflow for you to learn from."_ Below it, a **collapsed recording card**: 📷 **"Recorded demonstration · 9.9s"** with a `>` chevron to expand. Under that: `🌸 Working on it…` status line.

Right rail: Progress (collapsed) / Outputs (collapsed) / Context (**expanded**), showing a small stack of 3 document-icon thumbnails with caption "Track tools and referenced files used in this task."

A dismissible **Tip banner** floats just above the composer:

> **Tip** | "Ask for any file format: docs, spreadsheets, slides, PDFs, and more." | **[Add to message]** | X

Composer differs slightly from the plain-chat composer: it has an extra folder-add icon and a **"Manual"** mode dropdown (distinct from "Auto" seen elsewhere) — plus model picker "Sonnet 5 Max" and a **stop button** (solid square) replacing the send arrow while the task is actively "Working."

### Step 7 — Recording playback, event-by-event (07)

Expanding the recording card reveals an **event-by-event playback log**, each entry pairing a screenshot thumbnail with a timestamp and (where applicable) a labeled transition row:

- `Screenshot · 0.2s` — thumbnail (all-black in this capture, with a small red dot in the corner marking it as a captured recording frame)
- `→ Switched to Google Chrome   6.7s` (arrow-icon transition row with right-aligned elapsed time)
- `Screenshot · 6.7s` — thumbnail (mostly black, but a sliver of a light-blue browser chrome strip is visible on the left edge — the only non-black pixel content anywhere in this recording)
- `→ Switched to Claude   7.2s` (next transition, beginning to scroll into view)

A **"You've used 75% of your weekly limit"** banner with **"Get more usage"** now sits above the composer (distinct from the earlier 34%/90%/100% figures seen in Settings → Usage — usage tracking is visible both in a dedicated settings page and inline in the chat surface).

### Step 8 — Recording playback continued (08)

Scrolling further: `Switched to Google Chrome  6.7s` thumbnail, `→ Switched to Claude  7.2s`, `Screenshot · 7.2s` (also black). Immediately below the recording card, Claude's analysis text begins streaming in: _"I took a look at the recording, but there isn't much to go on: it shows the screen mostly black for about 7 seconds, a brief switch to Google Chrome, then back to Claude — no visible content, ty[ped text...]"_

### Step 9 — Capture-failure response (09)

The full response, and the **capture-failure UX pattern**:

> "I took a look at the recording, but there isn't much to go on: it shows the screen mostly black for about 7 seconds, a brief switch to Google Chrome, then back to Claude — no visible content, typed text, or clicks in either app. That's not enough for me to identify a concrete workflow (like a form fill, data lookup, or file operation) to turn into a reusable skill.
>
> A couple of possibilities: the screen recording may have started before anything visible happened, or the actual action took place in a window/area that wasn't captured.
>
> Could you tell me what you were trying to demonstrate, or try recording again with the relevant window in view? Once I can see what you did in Chrome, I can build a proper reproducible skill for it."

Below the message: a row of 4 small feedback/action icons (monitor/screen icon, speaker/read-aloud icon, thumbs-up, thumbs-down), then a fresh orange starburst avatar marking the turn boundary.

**This is the notable design decision of the whole flow**: rather than silently producing a broken/empty skill, Claude explicitly refuses to synthesize a skill from insufficient recording data, explains _why_ in plain language (diagnoses two plausible causes), and asks the user a clarifying question with a concrete retry suggestion. No skill artifact is created; no false "success" state is shown.

---

## Part 3 — Claude Code VS Code Extension (Antigravity IDE host)

Source: `claude_reference/132-135`.

### Empty state (132)

Extension side panel titled "Claude Code": `+ New session` button, **Local / Web** tab toggle (Local selected), a "Search sessions…" field, and empty-state copy **"No sessions yet."** Main editor-area panel shows the Claude Code logo, an orange pixel-art creature mascot, and: **"What to do first? Ask about this codebase or we can start writing code."**

A promo card is pinned above the composer: **"Fable 5 is now a standard part of your Max plan"** (dismissible X) with body copy: _"You can use up to 50% of your weekly usage limit on Fable 5. If you hit your limit, you can continue on Fable 5 with usage credits. Fable 5 draws down usage faster than Opus 4.8. Run /model and select Fable to use it."_ plus a support-article link.

A second dismissible bar sits just above the input: **"Prefer the Terminal experience? Switch back in Settings."** (X to dismiss) — confirms the extension has (at least) two rendering modes, "native UI" vs. "Terminal," user-switchable.

Composer: placeholder **"Ask Claude to edit…"**, mic icon, `+` button, a `/` (slash-command) icon, a **"Manual"** mode label, and a solid orange up-arrow send button.

Bottom VS Code status bar: git branch `chore/repo-restructure-2026-07*`, sync counts `0↓ 150↑`, problem counts `⊗ 0 ⚠ 0`, and — notably — **"Antigravity - Settings"** as the host-app label (proof this is Antigravity, not stock VS Code).

### Command menu — `+` → context/model/effort/thinking (133)

Clicking `+` opens a command palette (searchable via "Filter actions…") with two labeled groups:

- **Context**: Attach file…, Mention file from this project…, Clear conversation, Rewind.
- **Model**: Switch model… _(current: "Sonnet")_, **Effort (High)** rendered as a 3-position segmented/slider control, **Thinking** toggle (ON, blue), **"Switch models when a message is flagged"** toggle (ON, blue), Account & usage…

This confirms the extension exposes per-message **model, effort-level, and extended-thinking** controls directly from the composer's `+` menu, not only from a separate settings screen — matching the desktop app's model picker pattern but adding an explicit Effort slider not seen elsewhere in this set.

### Attach menu — upload / context / browse web (134)

A second, visually distinct `+`-style icon (paperclip-adjacent, bottom-left of composer) opens a shorter 3-item menu:

- **Upload from computer** (upload icon)
- **Add context** (document icon)
- **Browse the web** (globe icon)

This is a separate menu from the command palette in 133 — the extension has (at least) two different `+`-triggered menus depending on which icon is clicked.

### Settings — search "use terminal" (135)

The IDE's native Settings tab, searched for `claudeCode.useTerminal`, returns **"1 Setting Found"** under tabs **User / Workspace / Antigravity IDE Settings**:

> **Claude Code: Use Terminal**
> ☐ "Launch Claude in the terminal instead of the native UI."

Confirms the "native UI vs Terminal" toggle glimpsed in screen 132's dismissible banner is backed by a real, searchable, checkbox-type IDE setting (`claudeCode.useTerminal`), i.e. Claude Code ships as a config-driven VS Code/Antigravity extension with its own settings namespace, not a fully separate app shell.

---

## Part 4 — Claude Code Usage Dashboard (Desktop, Code tab)

Source: `claude_reference/136`.

Heading: **"🌸 What's up next, Siddhartha?"** — personalized, first-name greeting on the Code home tab (distinct from the Home tab's poetic rotating greetings seen elsewhere).

A single stats card with internal tabs **Overview / Models** and a time-range segmented control **All / 30d / 7d**:

- Stat tiles (2 rows × 4 cols): **Sessions** 1,672 · **Messages** 911,343 · **Total tokens** 494.9M · **Active days** 125 · **Current streak** 0d · **Longest streak** 24d · **Peak hour** 1 AM · **Favorite model** Opus 4.8.
- Below the tiles: a **contribution-heatmap-style grid** of small squares in varying blue intensities (GitHub-style activity heatmap), laid out across ~6 rows — the squares are NOT a plain rectangle; they visually cluster into two separated blocks (left/right), suggesting either a stylized/branded layout or calendar gaps rendering as blank cells. Caption underneath, playful: **"You've used ~7982× more tokens than The Great Gatsby."**

Below the stats card: an empty-state for the session list — **"Sessions you start will show up here"** with a faint scattered-pixel decorative icon.

Bottom context bar (persistent across the Code tab, not just this screen): `🖥 Local` · `📁 agiworkforce` (project) · `⑂ chore/repo-restructure-2026-07` (branch) · `☐ worktree` · a folder-share icon · a small pixel-mascot icon far right.

A banner sits above the composer: **"⏱ Approaching weekly usage limit — Resets Sat, Jul 25, 10:00 AM"** with **Upgrade** link and X dismiss. Composer placeholder: **"Describe a task or ask a question"** with a return-arrow icon. Mode row under composer: **"Auto"** pill (highlighted yellow), `+`, mic/settings icon, and model/effort label **"Opus 4.8 · High"** with a circular status icon.

---

## Part 5 — Home Launcher (Chat mode vs Cowork mode)

Source: `claude_reference/137-138`.

Both share the same left sidebar (Home/Code toggle, `+ New`, Projects, Artifacts, Scheduled, Dispatch _Beta_, Customize, Recents list, Design _Labs_, account row) and the same rotating-poetic-greeting pattern (e.g. **"🌸 Burning the midnight tokens"**).

### Cowork mode (137)

- Composer Chat/Cowork toggle: **Cowork** selected (dark/filled pill).
- Below the composer: a second control row — **"📁 Project or folder ⌄"** picker and **"⚠ Skip ⌄"** dropdown (the approvals-skip setting seen live in Part 1, here exposed as a per-session default before the task even starts) — plus a right-aligned usage-credits upsell: **"⚡ 2× more usage until August 5."**
- Usage warning banner above composer: **"You've used 75% of your weekly limit"** / **Get more usage** / X.
- Below the composer: an **"Active"** section header with a **"Clear active"** link, listing in-flight/recent Cowork tasks as rows (icon + title + relative timestamp, e.g. "LLM application reference documentation · 21 hours ago").
- Top-right corner shows a **"☁ Beta"** tag specific to Cowork mode.

### Chat mode (138)

- Composer Chat/Cowork toggle: **Chat** selected (light/filled pill).
- Composer gains an **extra icon** next to the mic (a voice-waveform icon) not present in Cowork mode — likely a "start voice mode" affordance specific to conversational chat.
- No "Active" task list (not applicable to plain chat).
- Below the composer: a row of **5 quick-action chips** — `</> Code` · `✏ Write` · `🎓 Learn` · `☕ Life stuff` · `💡 Claude's choice` — a topical launcher row absent from Cowork mode.
- Top-right corner shows a ghost/casper icon instead of the "☁ Beta" tag (reads as "nothing active" rather than a mode badge).

**Design takeaway**: the same home screen materially reconfigures its secondary controls (usage-credit upsell + active-task list + Skip/folder pickers vs. quick-action chips + voice icon) based solely on the Chat/Cowork toggle state — this is not just a placeholder-text change.

---

## Part 6 — Settings (complete walkthrough, all sub-pages captured)

Source: `claude_reference/139-156`. Settings render as a **centered modal overlay** (not a full page/route) on top of a dimmed/blurred home screen, with a persistent two-tier left rail and an X close button top-right of the modal. The rail has a search field at the very top ("Search").

### Left-rail navigation (verbatim, full tree as reconstructed from every settings screenshot)

```
Search [field]

Settings
├── General
├── Account
├── Privacy
├── Billing
├── Usage
├── Capabilities
├── Claude Code
├── Cowork
└── Claude in Chrome

Desktop app
├── General
├── Extensions
└── Developer

Customize
├── Skills
├── Connectors
└── Plugins
```

Note the deliberate grouping: "Settings" (account/product-level, syncs across devices) is visually separated from "Desktop app" (this-machine-only preferences) and "Customize" (skills/connectors/plugins — explicitly relocated here per the in-product note "Skills have moved to Customize" seen on the Capabilities page). "Extensions" and "Developer" under Desktop app were visible as nav labels but their content screens are **not covered by these captures**.

### General (139)

**Profile**: Avatar (circle, initial "S"), **Full name** ("Siddhartha"), **"What should Claude call you?"** ("Siddhartha" — a separate field from full name), **"What best describes your work?"** (Select dropdown, unset), **"Instructions for Claude"** (multi-line textarea, placeholder _"e.g. ask clarifying questions before giving detailed answers"_, helper text: _"Claude will keep these in mind across chats and Cowork within Anthropic's guidelines. Learn more"_).
**Preferences**: **Appearance** (3-icon segmented: monitor/sun/moon = System/Light/Dark), **Chat font** (dropdown, "Anthropic Serif"), **Motion** (row visible but cut off at bottom of capture — **not covered**).

### Account (140-141)

- **Log out of all devices** → [Log out]
- **"To delete your account, please cancel your Claude Max subscription first."** → [Delete account] (gated — cannot delete while subscribed)
- **Organization ID**: read-only UUID field (`f6292250-ad83-46bb-b99c-2e5050f5ae1f`)
- **Trusted devices** — _"Devices that can control your local machine through remote sessions."_ Table: Device | Added. Empty state: **"No trusted devices."**
- **Active sessions** — Table: Device | Location | Created | Updated. Rows captured:
  - `Claude (iOS)` — Arlington, Texas, US — Jul 21 2026 8:44 PM / 8:44 PM
  - `Claude D...` **[Current]** badge — Arlington, TX — Jul 20 2026 4:22 PM / Jul 21 8:46 PM
  - `Chrome (Mac OS X)` — Arlington, TX — Jul 20 2026 1:49 PM / Jul 21 11:28 AM

  This table is the single place in the product where iOS, Desktop, and the Chrome extension all appear as peer "device" rows — direct evidence of a unified session model across all three trust surfaces.

### Privacy (142-143)

Intro copy links to **Privacy Center** and **Privacy Policy**.

- **"How we protect your data"** — expandable row (`>` chevron), content not further expanded in captures.
- **"How we use your data"** — expandable row, same.
- **Preferences**:
  - **Location metadata** toggle — OFF. _"Allow Claude to use coarse location metadata (city/region) to improve product experiences."_
  - **Help improve our AI models** toggle — OFF. _"Allow the use of your chats and coding sessions to train and improve Anthropic AI models."_
- **Your data**:
  - **Export data** → [Export data]
  - **Shared chats** → [Manage]
  - **Shared artifacts** → [Manage]
  - **Memory preferences** → [Manage ↗] (external-link icon — routes to a separate memory settings surface, likely the one captured in the iOS set as screen 128)

### Billing (144)

- **Max plan** (tree/node icon) — _"20x more usage than Pro"_ — _"Your subscription will auto renew on Aug 20, 2026."_ → [Adjust plan]
- **Payment**: Visa •••• 5751 → [Update]
- **Invoices** table (Date | Total | Status | Actions):
  - Jul 20, 2026 — $106.72 — Paid — [View]
  - Jul 20, 2026 — $106.60 — Paid — [View] _(two full-price charges same day — worth noting as an anomaly if reconciling real billing data)_
  - Feb 1, 2026 — $0 — Paid — [View]
- **Cancellation**: Cancel plan → [Cancel] (red/destructive button)

### Usage (145)

- **Plan usage limits — Max (20x)**
- **Current session**: progress bar, 34% used, _"Resets in 1 hr 32 min"_
- **Weekly limits**: info callout — _"Fable 5 is still included with your Max plan. If you see a prompt to set up usage credits for it, restart Claude Code."_ + "Learn more about usage limits" link
  - **All models**: bar 90% used, resets Sat 10:00 AM
  - **Fable**: bar **100% used** (fully red), resets Sat 10:00 AM
  - "Last updated: just now ↻" (manual refresh icon)
- **Usage credits**: _"Turn on usage credits to keep using Claude if you hit a limit. Learn more"_ — toggle OFF

Note the three-tier usage display: session-level (hours), weekly-per-model-family (days), and a global "all models" weekly rollup — all visible on one screen, each with independent reset countdowns.

### Capabilities → Memory & Tools (146)

- **Memory**
  - **Search and reference chats** toggle — OFF. _"Allow Claude to search for relevant details in past chats."_
  - **Generate memory from chat history** `[Legacy]` tag, toggle — ON. _"Allow Claude to remember relevant context from your chats. This setting controls memory for both chats and projects."_
  - **Chat memory · No memory yet** (status row/button)
  - **Import memory from other AI providers** → [Start import]. _"Bring relevant context and data from another AI provider to Claude. We'll provide a prompt you can use to fetch the memory from your other account."_ — this is a documented cross-product migration path (competitor memory → Claude), stated in-product.
- **General**
  - **Tool access mode** — dropdown, _"Load tools when needed."_ _"Controls how connector tools are loaded in new conversations."_
  - **Connector search** toggle — OFF. _"Let Claude search the connector directory and surface ones relevant to your conversation."_
  - **Switch models when a message is flagged** toggle — ON.

### Capabilities → Artifacts & Execution (147)

- (top, partially cut off) main **Artifacts** toggle — ON — _"Generate code, documents, and designs in a dedicated window alongside your conversation."_
- **AI-powered artifacts** toggle — OFF. _"Build apps and interactive documents that use Claude inside the artifact."_
- **Inline visualizations** toggle — ON. _"Allow Claude to generate interactive visualizations, charts, and diagrams directly in the conversation."_
- **Code execution and file creation**
  - **Cloud code execution and file creation** toggle — ON. _"Claude can execute code on a server and create and edit docs, spreadsheets, presentations, PDFs, and data reports. Required for skills."_
  - **Allow network egress** toggle — OFF. _"Give Claude network access to install packages and libraries in order to perform advanced data analysis, custom visualizations, and specialized file processing. Monitor chats closely as this comes with security risks."_ (linked)
- **Skills**: _"Skills have moved to Customize."_ (link) — this page explicitly redirects; Skills settings content is **not covered by these captures**.

### Claude Code → General / Code appearance (148)

- **General**
  - **Classify session states** toggle — ON. _"Allow Claude to automatically classify sessions as blocked, ready for review, or done. Classifying sessions counts towards your plan usage. Applies to new sessions."_
  - **Switch models when a message is flagged** toggle — ON. _"...Applies to web and remote sessions."_
- **Code appearance**: two side-by-side theme dropdowns — **"Claude Light"** and **"Claude Dark"** — each rendering a **live diff preview** (a tiny `function greet(...)` snippet with a red-removed/green-added diff line) directly inside the dropdown control, so the user sees the actual syntax colors before picking.
- **Code font**: free-text input, placeholder _"e.g. JetBrains Mono"_ — _"Set a custom monospace font for code and terminal."_
- **Appearance**: **High-contrast dark theme** toggle — OFF. _"Use a darker, near-black background when dark mode is on."_

### Claude Code → Appearance / Transcript / Local sessions (149)

- (continued) High-contrast dark theme OFF.
- **Interface font**: segmented control, **Anthropic Sans** (selected) / System. _"Font for the Claude Code interface — menus, sidebar, and chat."_
- **Transcript text size**: segmented, Small / **Medium** (selected) / Large.
- **Transcript width**: segmented, **Narrow** (selected) / Medium / Wide. _"Maximum width of the transcript and composer columns."_
- **Local sessions**
  - **Allow bypass permissions mode** toggle — OFF. Long risk copy: _"Bypass all permission checks and let Claude work uninterrupted. This works well for workflows like fixing lint errors or generating boilerplate code. Letting Claude run arbitrary commands is risky and can result in data loss, system corruption, or data exfiltration (e.g., via prompt injection attacks). See best practices for safe usage ↗"_
  - **Enable remote control by default** toggle — OFF. _"Automatically connect new local sessions to Remote Control so you can continue them from the CLI or claude.ai/code."_
  - **Dynamic workflows** toggle — ON. _"Let Claude run multiple agents in parallel for complex tasks. Workflows can use a lot of your usage..."_ (cut off at bottom of capture)

### Claude Code → Worktree / Browser tools (150)

- **Draw attention on notifications** toggle — OFF. _"Bounce the Dock icon when Claude needs your attention and the app is not focused."_
- **Worktree location** — dropdown, _"Inside project (.claude/w...)"_. _"Where to store git worktrees for isolated coding sessions."_
- **Switch models when a message is flagged** toggle — ON (this exact toggle/copy pair recurs a third time here, scoped explicitly _"Applies to local sessions on this machine"_ — confirming the same setting name is deliberately duplicated per-scope: web/remote (148), local (149/150)).
- **Browser**
  - **Browser tools** toggle — ON. _"Claude can start your dev servers, browse the web in an in-app browser, and verify changes with screenshots, snapshots, and DOM inspection."_
  - **Open links in Browser panel** toggle — ON. _"Links Claude shares open as tabs in the Browser panel instead of your default browser."_
  - **Persist sessions** — dropdown, _"Don't keep"_. _"Save cookies, local storage, and login sessions for Browser tabs across app restarts. Shared uses the same data for every session in a project. Separate gives each session its own copy, so sessions never see each other's logins."_ (implies at least 3 options: Don't keep / Shared / Separate)
  - **Allowed sites** → [Manage]. _"Sites where Claude can use its Browser tools without a permission prompt."_

### Claude Code → iOS Simulator / Pull requests (151)

- **Mobile simulators**
  - **iOS Simulator** toggle — ON. _"Let Claude verify your changes in the iOS Simulator on this Mac: running your app, driving it through flows, and capturing screenshots and recordings. You will be asked before Claude uses each device. When off, Claude doesn't get its simulator tools, and you can still use the simulator in the app yourself."_
- **Pull requests**
  - **Branch prefix** — text input, value **"Fix"**. _"Prefix added to branch names for both local and cloud sessions."_
  - **Create pull requests automatically** toggle — OFF. _"When Claude pushes changes to a branch, it automatically opens a pull request without asking first. Applies to remote sessions only."_
  - **Autofix pull requests** toggle — OFF. _"When you create a pull request, Claude automatically monitors it for CI failures and review comments, then responds proactively. Claude may post comments on your behalf."_
  - **Auto-archive after PR merge or close** toggle — OFF. _"Automatically archive desktop sessions when the associated pull request is merged or closed. Archiving also removes the session's worktree and deletes its branch once the pull request is merged. Work that isn't pushed is kept."_

### Claude Code → Authorization tokens (152)

- **Authorization tokens** — _"Created when you sign in to Claude Code. Revoke a token to sign out from that device."_ Table (Application | Scopes), 4 rows, all "Claude Code":
  - Connected 2 hours ago — scopes: `user:file_upload` `user:inference` `user:mcp_servers` `user:profile` `user:sessions:claude_code`
  - Connected 1 day ago (×3 rows) — scopes: `user:file_upload` `user:inference` `user:profile` `user:sessions:claude_code`
    (Only the most-recent token carries `user:mcp_servers` — implies MCP-server access is a newer/added scope, granted going forward but not retroactively on older tokens.)
- **Claude Code (CLI, Desktop, IDE)**
  - **Delete sessions stored by Anthropic** → [Delete…]. _"Permanently delete Anthropic's server-side copies of your Claude Code sessions. Sessions stored locally on your computer aren't affected. Claude Code on the web sessions are managed separately — go to Claude Code."_
  - **Sharing settings** → [Manage]. _"Control how your claude.ai/code sessions are shared."_

### Cowork (153)

- **Dispatch** `[Beta]` toggle — ON. _"Let Claude work on tasks from your phone using this computer. When off, your phone won't be able to dispatch work here."_
- **Cowork files** — _"Your artifacts and scheduled tasks are stored at `/Users/siddhartha/Claude`."_ → [Change] (folder icon)
- **Trusted Cowork folders** — _"When you attach one of these folders to a Cowork task, Claude won't ask you to confirm."_ → [Manage]
- **Run new tasks in the cloud** toggle — ON. _"When on, new Cowork tasks start in the cloud instead of on this computer. Learn more"_
- **Global instructions** — _"Instructions here apply to all Cowork sessions. Use this for preferences, conventions, or context that Claude should always know."_ → [Edit]

### Claude in Chrome (154)

- **"Claude in Chrome settings"** `[Beta]`
- **Enable Claude in Chrome** toggle — ON. _"Use Claude in your browser with the Claude in Chrome extension. This setting only affects the extension."_
- **Site permissions** — _"These permissions apply to Claude in Chrome and the in-app Browser in Claude Code Desktop."_ (i.e., one permission model governs both the standalone Chrome extension AND the in-app Browser panel used by Claude Code's Browser tools, seen in screen 150.)
  - **Default for all sites** — dropdown, unset (_"Select default policy"_). _"Choose whether Claude works on all sites by default."_

### Desktop app → General (155-156)

- **General desktop settings**
  - **Run on startup** toggle — OFF. _"Automatically start Claude when you log in to your computer."_
  - **Quick access shortcut** — dropdown, _"Tap Option twice."_ _"Message Claude from anywhere on your desktop."_
  - **Voice shortcut** — dropdown, _"No shortcut."_ _"Speak to Claude from anywhere on your desktop."_
  - **Menu bar** toggle — ON. _"Show Claude in the menu bar."_
  - **Keep computer awake** toggle — ON. _"Prevent your computer from idle-sleeping while Claude is open so scheduled tasks can run. Your display can still turn off. Closing the laptop lid will still put it to sleep."_
- **Computer use** `[Beta]`
  - **Enable computer use** toggle — ON. _"Let Claude take screenshots and control your keyboard and mouse in apps you allow. Learn more"_
  - **Unhide apps when Claude finishes** toggle — ON. _"Apps hidden during a task are restored when Claude stops."_
  - **Denied apps** — _"Any request Claude makes to access these apps is automatically rejected. Claude may still affect them indirectly through actions in allowed apps."_ → [Add app ⌄]. Empty state: _"No apps denied. Add an app to automatically reject Claude's requests for it."_
  - **Accessibility** → **[Granted]** (status badge, not a toggle — reflects live macOS TCC permission state)
  - **Screen recording** → **[Granted]** (same pattern)

The last two rows are a notable UI pattern: OS-level permission grants (macOS Accessibility + Screen Recording, required for Computer Use to function at all) are surfaced read-only inside the app's own settings as status badges, distinct from in-app toggles — the app cannot flip these itself, only report and deep-link to the OS dialog presumably.

---

## Full settings tree (reconstructed, verbatim labels)

```
Settings (modal, searchable)
├── General
│   ├── Profile: Avatar, Full name, "What should Claude call you?",
│   │   "What best describes your work?", Instructions for Claude
│   └── Preferences: Appearance (System/Light/Dark), Chat font, Motion*
├── Account
│   ├── Log out of all devices
│   ├── Delete account (gated on canceling subscription first)
│   ├── Organization ID
│   ├── Trusted devices (table, empty state "No trusted devices.")
│   └── Active sessions (table: Device/Location/Created/Updated; iOS, Desktop*Current*, Chrome all listed as peer devices)
├── Privacy
│   ├── How we protect your data*
│   ├── How we use your data*
│   ├── Preferences: Location metadata, Help improve our AI models
│   └── Your data: Export data, Shared chats, Shared artifacts, Memory preferences (↗ external)
├── Billing
│   ├── Plan summary (name, multiplier, renewal date) + Adjust plan
│   ├── Payment method + Update
│   ├── Invoices (Date/Total/Status/Actions → View)
│   └── Cancellation: Cancel plan
├── Usage
│   ├── Plan usage limits (header, plan name)
│   ├── Current session (progress bar + reset countdown)
│   ├── Weekly limits: info callout, All models bar, per-model (Fable) bar, Last updated + refresh
│   └── Usage credits (toggle)
├── Capabilities
│   ├── Memory: Search and reference chats, Generate memory from chat history [Legacy],
│   │   Chat memory status, Import memory from other AI providers
│   ├── General: Tool access mode, Connector search, Switch models when a message is flagged
│   ├── Artifacts: (main toggle)*, AI-powered artifacts, Inline visualizations
│   ├── Code execution and file creation: Cloud code execution and file creation, Allow network egress
│   └── Skills → redirects to Customize
├── Claude Code
│   ├── General: Classify session states, Switch models when a message is flagged (web/remote scope)
│   ├── Code appearance: Light theme picker (live diff preview), Dark theme picker (live diff preview), Code font
│   ├── Appearance: High-contrast dark theme, Interface font, Transcript text size, Transcript width
│   ├── Local sessions: Allow bypass permissions mode, Enable remote control by default, Dynamic workflows
│   ├── (unlabeled continuation): Draw attention on notifications, Worktree location,
│   │   Switch models when a message is flagged (local scope)
│   ├── Browser: Browser tools, Open links in Browser panel, Persist sessions, Allowed sites
│   ├── Mobile simulators: iOS Simulator
│   ├── Pull requests: Branch prefix, Create pull requests automatically, Autofix pull requests,
│   │   Auto-archive after PR merge or close
│   └── Authorization tokens: per-device token table (Application/Scopes),
│       Delete sessions stored by Anthropic, Sharing settings
├── Cowork
│   ├── Dispatch [Beta] (toggle)
│   ├── Cowork files (storage path + Change)
│   ├── Trusted Cowork folders (Manage)
│   ├── Run new tasks in the cloud (toggle)
│   └── Global instructions (Edit)
├── Claude in Chrome
│   ├── Enable Claude in Chrome (toggle)
│   └── Site permissions: Default for all sites (policy dropdown)
│       — governs both the Chrome extension AND Claude Code Desktop's in-app Browser panel
│
├── Desktop app
│   ├── General
│   │   ├── Run on startup, Quick access shortcut, Voice shortcut, Menu bar, Keep computer awake
│   │   └── Computer use [Beta]: Enable computer use, Unhide apps when Claude finishes,
│   │       Denied apps (Add app), Accessibility [Granted — read-only OS status],
│   │       Screen recording [Granted — read-only OS status]
│   ├── Extensions*
│   └── Developer*
│
└── Customize
    ├── Skills*
    ├── Connectors*
    └── Plugins*
```

`*` = nav item or section header seen, but its full content screen is **not covered by these captures**.

---

## Control inventory (representative — not exhaustive of every toggle already itemized above)

| Screen                       | Control                                   | Type                                | What it appears to do                                                                                                                                        |
| ---------------------------- | ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cowork task view             | "Found tools" row                         | expandable code card                | Shows raw tool-search Request/Response JSON inline in the transcript                                                                                         |
| Cowork task view             | Skip-approvals banner                     | persistent dismissible banner       | Warns that unattended actions bypass all confirmation prompts                                                                                                |
| Cowork task view             | Folder-access modal                       | modal, checkbox + Cancel/Allow      | Grants filesystem read/write + command-exec scope to N absolute paths for the session                                                                        |
| Cowork task view             | Progress rail                             | expandable numbered stepper         | Shows a live agent-authored task plan with a highlighted current step                                                                                        |
| Cowork task view             | Skip dropdown (composer)                  | dropdown w/ warning icon            | Per-session default for approval-skipping, set before task starts                                                                                            |
| Record-a-skill               | `+` → Record a skill                      | menu item                           | Launches screen-recording consent modal                                                                                                                      |
| Record-a-skill               | Active capture pill                       | floating status pill                | Live step counter + mic level + Discard/Done                                                                                                                 |
| Record-a-skill               | Recording card                            | expandable timeline                 | Screenshot-by-screenshot + app-switch event log with per-event timestamps                                                                                    |
| Record-a-skill               | Capture-failure response                  | plain assistant message             | Explicitly refuses to synthesize a skill from insufficient recording data; asks user to retry                                                                |
| VS Code ext                  | `+` command palette                       | searchable menu, 2 groups           | Context actions (attach/mention/clear/rewind) + Model controls (switch model, Effort slider, Thinking toggle, flagged-message model switch, Account & usage) |
| VS Code ext                  | Attach menu (2nd `+`)                     | 3-item menu                         | Upload from computer / Add context / Browse the web                                                                                                          |
| VS Code ext                  | Settings search                           | search-filtered list                | `claudeCode.useTerminal` checkbox toggles native UI vs terminal rendering                                                                                    |
| Code usage dashboard         | Overview/Models tabs + All/30d/7d         | segmented controls                  | Scopes the 8-tile stat grid and heatmap to a time window / by-model breakdown                                                                                |
| Home launcher (Cowork)       | Chat/Cowork toggle                        | 2-state pill                        | Swaps the entire secondary control row (folder+skip pickers+active list vs quick-action chips+voice icon)                                                    |
| Settings → Usage             | Current session / All models / Fable bars | 3 independent progress bars         | Session-level, weekly-all-model, and weekly-per-model-family usage, each with its own reset time                                                             |
| Settings → Claude Code       | Light/Dark theme dropdowns                | dropdown with embedded live preview | Renders an actual colored diff snippet inside the dropdown before selection                                                                                  |
| Settings → Claude Code       | Persist sessions                          | dropdown ("Don't keep")             | Controls whether Browser-panel cookies/logins survive app restart; implies Shared vs Separate-per-session options                                            |
| Settings → Claude in Chrome  | Default for all sites                     | dropdown                            | One policy surface shared by both the Chrome extension and Desktop's in-app Browser                                                                          |
| Settings → Desktop → General | Accessibility / Screen recording          | read-only "Granted" badges          | Surfaces live macOS permission grant state; not togglable from inside the app                                                                                |
| Settings → Account           | Active sessions table                     | data table                          | Lists iOS, Desktop (Current), and Chrome as peer "device" rows under one session model                                                                       |
| Settings → Capabilities      | Import memory from other AI providers     | button → external flow              | Explicit, named cross-product memory migration path from "another AI provider"                                                                               |

---

## Notable design decisions

1. **Same-named toggle, three independent scopes.** "Switch models when a message is flagged" appears three times across Capabilities/General, Claude Code/General, and Claude Code/Worktree — each explicitly scoped in its own helper text ("Applies to web and remote sessions" vs "Applies to local sessions on this machine"). The product chooses to duplicate a setting per-surface rather than have one global switch, trading a flatter mental model for scope precision.
2. **Non-blocking risk disclosure over blocking confirmation.** The "Skip all approvals is on" banner in an active Cowork run is a persistent, dismissible banner — not a modal — while first-time folder access is still gated by a hard modal. The product distinguishes "ongoing risk you should be aware of" from "one-time consent you must grant."
3. **Live preview inside a picker, not after selection.** The Claude Light/Claude Dark code-theme dropdowns render an actual colored diff snippet inline in the closed control — you see the theme before opening the dropdown, not just a swatch name.
4. **Capture-failure produces an explanation, not a fake result.** The record-a-skill flow, when given a black/empty recording, does not silently emit a broken skill. It diagnoses two plausible causes in plain language and asks a specific clarifying question with a concrete retry instruction — a deliberate "fail loud, explain, and unblock the user" pattern.
5. **OS permissions surfaced as read-only status, not app toggles.** Accessibility and Screen Recording show as "Granted" badges, distinct visually and interactively from the blue toggles used everywhere else in the same settings page — signaling "this app can't control this state" without a separate empty/disabled treatment.
6. **Progressive disclosure via consistent collapse/expand chevrons.** Progress / Outputs / Context in the Cowork right rail, and How-we-protect/How-we-use in Privacy, all use the same `>`/`⌄` disclosure pattern — collapsed state always shows a one-line summary/caption even when empty (e.g., "See task progress for longer tasks," "Track tools and referenced files used in this task").
7. **Mode-dependent composer identity.** The composer is not one fixed control — the Chat vs Cowork toggle, and the plain-chat vs record-a-skill-task vs VS-Code-extension contexts, each swap in different auxiliary controls (Skip dropdown, folder picker, Manual/Auto mode label, extra voice icon, stop-vs-send button shape) around a visually similar text field.
8. **Two distinct `+`-triggered menus in the same VS Code composer** (133 vs 134) — one for context/model/effort/thinking, one for upload/context/browse-web — rather than one combined menu, suggesting a deliberate split between "how the model should think" and "what to attach."

---

## Capabilities visible only from these screenshots (not discoverable from docs)

- **The Cowork agent literally shows its own tool-search query as JSON** (`select:TaskCreate,TaskUpdate,WebSearch,WebFetch`) inline in the transcript — confirming a tool-discovery/tool-search step exists as a distinct, user-visible phase before tool execution, not just direct tool invocation.
- **First-time folder grants are NOT covered by "Skip all approvals."** The modal in screen 102 fires even while the persistent skip-approvals banner is showing elsewhere in the same session — the product treats new filesystem scope as a hard gate independent of the global skip setting.
- **"Fable" is a named, separate weekly usage bucket from "All models"** in Settings → Usage, each with independent progress bars and reset times, and it's explicitly called out as "still included" in the Max plan via an info callout that warns about a known bug ("if you see a prompt to set up usage credits for it, restart Claude Code") — i.e., a live, in-product acknowledgment of a rollout glitch for this specific model tier.
- **Authorization-token scopes differ by issuance date**: only the most recent Claude Code token grants `user:mcp_servers`; three older tokens for the same "Claude Code" application lack it — evidence that MCP-server access was added to the OAuth scope set after the older tokens were minted, and scopes are not retroactively upgraded.
- **One Chrome-extension permission model double-serves two products.** Settings → Claude in Chrome's "Site permissions" explicitly states it governs both the standalone Chrome extension and the in-app Browser panel inside Claude Code Desktop (seen separately in Settings → Claude Code → Browser tools) — a shared permission surface across what look like two separate features.
- **The record-a-skill capture counts discrete "steps" live, not just time** — "Capturing · 0 steps" — implying an action-level (click/keystroke/app-switch) event model under the hood, distinct from a plain screen-recording timer.
- **Desktop OS permission state (Accessibility, Screen Recording) is read into the app and displayed, not merely required at runtime** — the settings page proactively shows current grant status per-permission, which is only discoverable by opening the app's own settings, not from any public capability list.
- **The VS Code extension host is Google's Antigravity IDE**, and the extension coexists in the same toolbar with what appears to be a second AI-coding extension icon — real evidence of multi-extension coexistence in a single IDE window, not just a Claude-only environment.
- **Two full-price invoices ($106.72 and $106.60) on the same date (Jul 20, 2026)** in the Billing table — a real anomaly in the captured account's billing history, worth flagging if this data set is ever used to sanity-check a billing/proration audit.

---

## Explicitly not covered by these captures

- Skills library/browser content (nav item seen, destination screen not in this set)
- Connectors picker content (nav item + composer submenu seen, destination screen not in this set)
- Plugins browser content (nav item seen, destination screen not in this set)
- Desktop app → Extensions and → Developer settings pages (nav items seen, content not captured)
- General → Motion preference (row visible but cut off before its control renders)
- "How we protect your data" / "How we use your data" expanded content (rows seen collapsed only)
- Outputs panel expanded/populated state in the Cowork task view (only the empty/caption state was captured)
- Any Dispatch mobile-side flow (only the desktop-side "Dispatch [Beta]" toggle and the cross-device onboarding teaser modal were captured; the phone-side pairing/dispatch UI belongs to the iOS screenshot set, outside this assignment)
