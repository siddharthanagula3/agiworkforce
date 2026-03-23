# AGI Workforce Mobile App — Complete Specification

> Single source of truth for building the entire mobile application.
> All decisions locked 2026-03-22 via interactive design review.

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Navigation](#navigation)
3. [Theme & Design System](#theme--design-system)
4. [Chat Interface](#chat-interface)
5. [Input Bar](#input-bar)
6. [Model Selector](#model-selector)
7. [Empty State](#empty-state)
8. [Thinking / Reasoning UI](#thinking--reasoning-ui)
9. [Tool Execution UI](#tool-execution-ui)
10. [Artifacts](#artifacts)
11. [Web Search & Citations](#web-search--citations)
12. [Message Interactions](#message-interactions)
13. [Conversation Management](#conversation-management)
14. [Voice Mode](#voice-mode)
15. [Dispatch (Desktop Companion)](#dispatch-desktop-companion)
16. [Skills Browser](#skills-browser)
17. [Projects](#projects)
18. [Connectors](#connectors)
19. [Settings](#settings)
20. [Personalization](#personalization)
21. [Usage & Billing](#usage--billing)
22. [Authentication & Onboarding](#authentication--onboarding)
23. [Push Notifications](#push-notifications)
24. [Image Generation](#image-generation)
25. [Scheduling](#scheduling)
26. [Memory](#memory)
27. [iPad Support](#ipad-support)
28. [Offline Mode](#offline-mode)
29. [Capabilities Toggles](#capabilities-toggles)
30. [Backend API](#backend-api)
31. [What's NOT in v1](#whats-not-in-v1)
32. [Competitive Advantages](#competitive-advantages)
33. [Build Phases](#build-phases)

---

## Tech Stack

```
Framework:     Expo SDK 52+ (React Native)
Router:        Expo Router v4 (file-based)
Styling:       NativeWind v4 (Tailwind v3 tokens)
State:         Zustand v5 + MMKV persistence
Sheets:        @gorhom/bottom-sheet v5
Lists:         @shopify/flash-list
Auth:          Supabase JS v2 + Apple Auth + Google (PKCE)
Icons:         lucide-react-native + react-native-svg
Companion:     react-native-webrtc (DataChannel for control)
Voice:         expo-av (recording) + Whisper cloud (STT) + TTS
Camera:        expo-camera (QR scanning) + expo-image-picker
Notifications: expo-notifications
Navigation:    @react-navigation/drawer v7
```

### Monorepo Integration

- Directory: `apps/mobile/`
- Metro `watchFolders` for shared packages
- Reuse from workspace: SignalingClient, formatDate, validateEmail, sleep, retry, debounce, AppError

---

## Navigation

**Pattern:** Slide-out drawer

- iPhone: `type='front'` (slides over content)
- iPad: `type='permanent'` (always visible sidebar)

**6 Navigation Items:**

```
📬 Chat          — Conversation list + new chat
⚡ Skills        — 150+ skill browser by category
📁 Projects      — Organized workspaces with Chats/Sources tabs
💻 Dispatch      — Persistent desktop companion thread
🔗 Connectors    — Service integrations with toggles
⚙️ Settings      — Full settings page (5 groups)
```

**Drawer Layout:**

```
┌─────────────────────────┐
│ ☰  AGI Workforce    [+] │
├─────────────────────────┤
│                         │
│  📬 Chat                │
│  ⚡ Skills              │
│  📁 Projects            │
│  💻 Dispatch            │
│  🔗 Connectors          │
│  ⚙️ Settings            │
│                         │
│  ── Recents ──          │
│  Research on LLMs       │
│  Draft email to...      │
│  Code review for...     │
│                         │
│  ┌───────────────────┐  │
│  │ 👤 Siddhartha   [+]│  │
│  └───────────────────┘  │
└─────────────────────────┘
```

- Recents list below nav items (recent conversations)
- User profile at bottom: avatar + name + new chat button
- [+] top-right creates new chat

---

## Theme & Design System

**Theme:** System default (follows OS dark/light mode setting)

- 3 options in settings: Dark / Light / System
- Both themes must be fully designed

**Accent Color:** Teal/Cyan (AGI Workforce brand)

- Toggles, selected states, badges, buttons, links
- Distinct from: Claude (orange), ChatGPT (green), Gemini (blue), Perplexity (teal-green)

**Design Tokens:**

- Rounded corners on all cards, inputs, sheets (radius: 12-16px)
- Bottom sheets for all pickers (models, attachments, options) — standard iOS pattern with drag handle
- Haptic feedback on: send, approve/reject, toggle switches, navigation
- Icons: Lucide React Native (matching desktop)
- Typography: System font (SF Pro on iOS, Roboto on Android)
- Shadows: Subtle on cards, none on flat elements
- Spacing: 4px grid system

**User Messages:** Dark rounded bubble, right-aligned
**AI Messages:** Left-aligned, full-width, no bubble background

```
┌───────────────────────────┐
│         ┌──────────────┐  │
│         │ How do I fix │  │
│         │ this bug?    │  │
│         └──────────────┘  │
│                            │
│ Here's how to fix it:      │
│ 1. First, check the...     │
│ 2. Then update the...      │
└───────────────────────────┘
```

---

## Chat Interface

### Chat Header (Minimal)

```
┌───────────────────────────┐
│ ← (back)        ••• (menu)│
└───────────────────────────┘
```

- Left: Back arrow (returns to drawer/list)
- Right: Menu dots (share, rename, delete, archive)
- NO model info in header (model is in input bar pill)
- Clean, maximizes content area

### Streaming Cursor

**AGI Workforce logo animation** — animated teal sparkle at the end of streaming text. Brand-distinctive. Pulses while generating.

```
...the latest models include ✨ (teal sparkle pulses)
```

### During Streaming — Input Bar Changes To:

```
┌───────────────────────────┐
│ Reply to Claude...     [■] │
│ [+]                        │
└───────────────────────────┘
```

- Placeholder changes to "Reply to [model name]..."
- Send button becomes stop button (black square)
- Model pill and brain toggle hidden during generation
- [+] attachment button remains accessible

---

## Input Bar

**Layout (idle state):**

```
┌──────────────────────────────┐
│  Ask anything...              │
│  [+][Model▾]    [🔗][🎙][➤]  │
└──────────────────────────────┘
```

**Elements (left to right):**

1. **[+]** — Opens "Add to Chat" sheet (attachments, modes, toggles, config)
2. **[Model▾]** — Model pill (provider icon + name), opens model selector bottom sheet (SEPARATE from +)
3. **[🔗]** — Sources/connectors quick access
4. **[🎙]** — Mic button (tap = transcribe, long-press = voice mode)
5. **[➤]** — Send button (arrow). Changes to **[■]** stop during streaming

Note: Brain/thinking toggle is inside the model selector (per-model), NOT a separate button on the input bar.

### "Add to Chat" Sheet (+ button)

Hybrid of Perplexity's clean layout + Claude's feature toggles:

```
┌────────────────────────────────┐
│ X         Add to Chat          │
│                                │
│ [📷 Camera][🖼 Photos][📄 File][⚡ Skills]│
│                                │
│ ● Chat (default)               │
│ ○ Research                     │
│   In-depth reports & analysis  │
│ ○ Create                       │
│   Generate docs, slides & apps │
│                                │
│ 🌐 Web search          [● ON] │
│ 🎨 Image generation    [● ON] │
│ ❤️ Health        Beta  [○ OFF] │
│                                │
│ 📁 Add to project      None > │
│ 🎨 Choose style      Normal > │
│ 🛠 Tool access          Auto > │
│ 🔗 Manage Connectors       >  │
└────────────────────────────────┘
```

**Attachment row:**

- **Camera** — Take photo directly (expo-camera)
- **Photos** — Pick from camera roll (expo-image-picker)
- **File** — Document picker (PDFs, docs, spreadsheets)
- **Skills** — Quick skill launcher (our unique feature)

**Mode selector (mutually exclusive):**

- **Chat** — Standard conversation (default)
- **Research** — Deep research with in-depth reports
- **Create** — Generate documents, slides, and apps

**Feature toggles:**

- **Web search** — ON by default. AI searches web when needed
- **Image generation** — ON by default. AI can generate images
- **Health** — Beta badge, OFF by default. Reads Apple HealthKit data (steps, sleep, heart rate, workouts). Reference: existing HxF Swift app at ~/Desktop/HxF

**Chat configuration:**

- **Add to project** — Assign this chat to a project (None / select)
- **Choose style** — Per-chat response style: Normal, Concise, Detailed, Creative
- **Tool access** — Per-chat tool loading: Auto (AI decides), On demand, Always available
- **Manage Connectors** — Quick link to connectors page

---

## Model Selector

**Trigger:** Tap Model pill in input bar → bottom sheet at 50%/90% snap points

**Layout (Perplexity-style flat list with auto modes):**

```
┌──────────────────────────────┐
│           Models          X  │
│                              │
│  Economy                ✓    │
│  Best for cost               │
│                              │
│  Balanced                    │
│  Best value                  │
│                              │
│  Best                        │
│  Most capable                │
│  ────────────────────────    │
│  ✨ Claude Opus 4.6          │
│     With thinking    [--●]   │
│  ✨ Claude Sonnet 4.6        │
│  ✨ Claude Haiku 4.5         │
│  ○ GPT-5.4           New    │
│  ○ GPT-4.5                  │
│  ○ o3-mini                   │
│  ◆ Gemini 3.1 Pro            │
│  ◆ Gemini 3 Flash            │
│  ◇ Grok-3                    │
│  ▪ DeepSeek-V3               │
│  ◈ Sonar                     │
│  ■ Nemotron 3 Super          │
└──────────────────────────────┘
```

**Key Features:**

- **3 auto modes at top:** Economy (cheapest), Balanced (best value), Best (most capable). Backend picks optimal model per task. Highlighted card style with subtitle.
- **Flat model list below** — all models in one scrollable list with provider brand icons (NO provider grouping headers). Like Perplexity's design.
- **Per-model "With thinking" toggle** — appears when model is tapped/selected. Like Perplexity's expand-to-show-toggle pattern.
- Checkmark on currently selected model/mode
- "New" badge on recently added models
- No BYOK on mobile — managed cloud only
- Tap a model to select it and close the sheet
- Tap selected model again to expand and show thinking toggle

---

## Empty State

**Pattern:** Minimal — no chips (like Claude/Perplexity)

```
┌───────────────────────────┐
│ ← (back)        ••• (menu)│
│                            │
│                            │
│         ✨ (logo)          │
│   Good evening, Siddhartha │
│   How can I help you?      │
│                            │
│                            │
│                            │
│────────────────────────────│
│ [+][✨ Opus▾][🧠]   [🎙][➤]│
└───────────────────────────┘
```

- AGI Workforce logo/icon with subtle animation
- Time-aware greeting: "Good morning/afternoon/evening, [name]"
- "How can I help you?" subtitle
- Clean, focused — no suggestion chips or quick actions
- Input bar ready at bottom

**First launch bonus:** Dismissible banner at top prompting desktop pairing:

```
┌─────────────────────────┐
│ 💻 Pair your desktop?  X │
│ Scan QR to connect       │
└─────────────────────────┘
```

---

## Thinking / Reasoning UI

**Pattern:** Bottom sheet (like Claude iOS) — NOT inline accordion

### Collapsed State (in chat)

```
⏱ Weighed solo developer potential against esta...  >
```

- Single line between user message and AI response
- Clock icon (⏱) + truncated preview of thinking text + chevron (>)
- Shows thinking summary/duration after completion: "⏱ Thought for 4.2s >"

### Expanded State (tap to open)

```
┌───────────────────────────┐
│ X    Thought process       │
│ ─────────────────────────  │
│                            │
│ The user is asking about   │
│ whether a single person    │
│ can compete with...        │
│                            │
│ Let me think about what    │
│ they might mean...         │
│                            │
│ Given the context of AGI   │
│ Workforce as a solo...     │
│                            │
│ [scrollable content]       │
└───────────────────────────┘
```

- Bottom sheet with drag handle
- X close button (left) + "Thought process" title (centered)
- Full scrollable thinking text
- @gorhom/bottom-sheet with 90% snap point

---

## Tool Execution UI

**Pattern:** Grouped step list — all tool calls collected into a single collapsible "Steps" section with numbered items.

> Note: Tool execution UI to be finalized based on additional screenshots from user.

### Collapsed

```
🔧 3 steps completed  >
```

### Expanded

```
┌───────────────────────────┐
│ 🔧 Steps               ▼  │
│ ─────────────────────────  │
│ 1. ✅ Web Search           │
│    "AI desktop apps 2026"  │
│                            │
│ 2. ✅ Read File             │
│    sales_data.xlsx         │
│                            │
│ 3. ⏳ Generate Report      │
│    Creating Q1 summary...  │
└───────────────────────────┘
```

**Important context:** Agent/code execution happens on **desktop only**. Mobile is a remote control — it shows status and outcomes, not local execution.

---

## Artifacts

**Pattern:** Inline rich cards — like ChatGPT

```
In chat:
┌──────────────────────────┐
│ 📄 Sales Report Q1       │
│ ────────────────────────  │
│ Revenue: $2.4M (+12%)    │
│ Top product: Widget X    │
│           [Open ▶]       │
└──────────────────────────┘
```

- Embedded cards in chat flow showing content preview
- Tap to expand to **full-screen overlay**
- Supports: code blocks, documents, charts, tables, presentations
- Full-screen has share, copy, download actions

---

## Web Search & Citations

**Pattern:** Collapsible sources

```
In AI response:

...the latest models include Claude Opus 4.6 [1]
and GPT-5.4 [2] which offer improved...

┌───────────────────────────┐
│ 📎 View 3 sources      ▶  │
└───────────────────────────┘

Expanded:
┌───────────────────────────┐
│ 📎 Sources              ▼  │
│ [1] 🌐 anthropic.com       │
│     Claude Opus 4.6...     │
│ [2] 🌐 openai.com          │
│     GPT-5.4 release...     │
│ [3] 🌐 techcrunch.com      │
│     AI desktop apps...     │
└───────────────────────────┘
```

- Numbered inline citations [1][2] in response text
- Collapsed by default: "View X sources" with expand chevron
- Each source: favicon + domain + title snippet
- Tap source to open in system browser

---

## Message Interactions

**Long-press menu** (context menu on any message):

- **Copy** — Copy message text to clipboard
- **Share** — System share sheet
- **Retry** — Regenerate AI response (AI messages only)
- **Edit** — Edit and resend (user messages only)

**Swipe to reply:**

- Swipe right on any message to quote-reply
- Shows quoted message above input bar with X to dismiss

**Double-tap to react:**

- Double-tap any AI message to add 👍/👎 reaction
- Provides feedback signal for AI improvement

**Haptic feedback:**

- On send, approve/reject, toggle switches, navigation transitions
- Configurable in Settings > Haptic Feedback toggle

---

## Conversation Management

**Sidebar chat list** with date grouping:

```
┌───────────────────────────┐
│ 🔍 Search conversations    │
│                            │
│ 📌 Pinned                  │
│ Research on LLMs           │
│                            │
│ ── Today ──                │
│ Draft email for team       │
│ Code review PR #42         │
│                            │
│ ── Yesterday ──            │
│ Market analysis Q1         │
│ Bug fix websocket          │
│                            │
│ ── This Week ──            │
│ Legal contract review      │
│                            │
│ ── Older ──                │
│ Investor pitch deck        │
└───────────────────────────┘
```

**Swipe gestures:**

- Swipe left → Delete (with confirmation)
- Swipe right → Pin to top

**Long-press menu:**

- Pin / Unpin
- Rename (edit auto-generated title)
- Archive (hidden but not deleted)
- Delete (permanent, with confirmation)

**Search bar** at top of conversation list — searches titles and content.

---

## Voice Mode

**Tap mic** = Quick transcription

```
┌───────────────────────────┐
│  🎙 Recording...    [stop] │
│  ▁▂▃▅▇▅▃▂▁▂▃▅▇▅▃         │
└───────────────────────────┘
→ Whisper cloud transcription → text fills input field
→ User reviews and taps send
```

**Long-press mic** = Full voice conversation mode

```
┌───────────────────────────┐
│                            │
│                            │
│    ▁▂▃▅▇█▇▅▃▂▁▂▃▅▇       │
│    Listening...            │
│                            │
│    Opus 4.6                │
│                            │
│         [● END]            │
│                            │
└───────────────────────────┘
```

- Full-screen takeover with waveform visualization
- Real-time STT (Whisper cloud) + TTS response
- Interrupt capability (talk over AI to stop)
- Model name displayed during voice mode
- Large END button to exit voice mode

---

## Dispatch (Desktop Companion)

**Concept:** Persistent single thread with desktop — like Claude's Dispatch. Mobile assigns tasks, desktop executes using local files, connectors, plugins. Results delivered back to the conversation.

**Requirements:**

- Desktop app must be running and awake
- Both devices on same account
- Active internet connection on both

### Pairing: QR Code Scan

```
Desktop shows:          Phone scans:
┌──────────────────┐    ┌──────────────────┐
│   ████████████   │    │  📷 Scanning...   │
│   ██ QR CODE ██  │    │                   │
│   ████████████   │    │  ✓ Paired!        │
│  Scan with phone │    │  MacBook Pro      │
└──────────────────┘    └──────────────────┘
```

### Dispatch Page

```
┌───────────────────────────┐
│ ← Dispatch        ••• (menu)│
│                            │
│ 💻 MacBook Pro (Sid)       │
│ 🟢 Connected               │
│ ───────────────────────    │
│                            │
│ You: Prepare Q1 report     │
│ from sales.xlsx            │
│                            │
│ ✅ Task complete            │
│ Created: Q1_Report.pdf     │
│ Location: ~/Desktop/       │
│ [Preview] [Open on Mac]    │
│                            │
│ You: Now email it to team  │
│                            │
│ ⏳ Working...              │
│ Searching contacts and     │
│ drafting email...          │
│                            │
│────────────────────────────│
│ [+] Message desktop... [➤] │
└───────────────────────────┘
```

**Key behaviors:**

- Single persistent thread (context retained across sessions)
- Desktop connection status indicator (🟢 Connected / 🔴 Disconnected)
- Device name shown at top (e.g., "MacBook Pro (Sid)")
- Task results show: ✅ status + created file + location + [Preview] + [Open on Mac]
- Push notification when task completes: "✅ Q1 Report complete"
- File access: View results only (no file browsing from phone)
- When desktop disconnected: "Desktop offline — tasks will queue until it reconnects"

**Our advantages over Claude's Dispatch:**

1. Push notifications on task complete (Claude lacks this)
2. Approve/deny individual actions via push
3. Multiple task visibility
4. Scheduling from mobile (Claude manages separately)

---

## Skills Browser

**Pattern:** Category grid + search

```
┌───────────────────────────┐
│ Skills        🔍 Search... │
│                            │
│ ┌──────────┐┌──────────┐  │
│ │⚖️ Legal   ││🏥 Medical│  │
│ │ 12 skills ││ 8 skills │  │
│ └──────────┘└──────────┘  │
│ ┌──────────┐┌──────────┐  │
│ │💰 Finance ││✍️ Writing│  │
│ │ 15 skills ││ 20 skills│  │
│ └──────────┘└──────────┘  │
│ ┌──────────┐┌──────────┐  │
│ │💻 Code    ││🎓 Edu    │  │
│ │ 25 skills ││ 10 skills│  │
│ └──────────┘└──────────┘  │
│ ┌──────────┐┌──────────┐  │
│ │🏠 Real Est││📊 Data   │  │
│ │ 8 skills  ││ 12 skills│  │
│ └──────────┘└──────────┘  │
└───────────────────────────┘
```

- Search bar at top (filters across all categories)
- 2-column grid of category cards
- Each card: icon + category name + skill count
- Tap category → skill list within that category
- Tap skill → starts new chat with that skill pre-loaded as system context
- Also accessible from attachment menu via [⚡ Skills] button

---

## Projects

**Pattern:** Card list with tabs (like ChatGPT)

```
┌───────────────────────────┐
│ Projects           [+ New] │
│                            │
│ ┌────────────────────────┐ │
│ │ 📁 AGI Workforce       │ │
│ │ Desktop app project    │ │
│ │ 3 chats • 2 sources    │ │
│ │ Updated 2h ago         │ │
│ └────────────────────────┘ │
│ ┌────────────────────────┐ │
│ │ 📁 Legal Research      │ │
│ │ Contract review        │ │
│ │ 1 chat • 5 sources     │ │
│ │ Updated 3d ago         │ │
│ └────────────────────────┘ │
└───────────────────────────┘

Inside a project:
┌───────────────────────────┐
│ ← AGI Workforce    ••• │
│ [Chats] [Sources]          │
│                            │
│ Chat 1: UI component plan  │
│ Chat 2: Rust backend arch  │
│ Chat 3: Deploy checklist   │
│                            │
│────────────────────────────│
│ Message AGI Workforce... [➤]│
└───────────────────────────┘
```

- Project cards: name + description + chat count + source count + last activity
- Two tabs inside project: **Chats** (conversation list) | **Sources** (attached files/docs)
- [+ New] button to create project
- Input bar scoped to project: "Message [project name]"

---

## Connectors

**Pattern:** Toggle list like Perplexity — separate nav item

```
┌───────────────────────────┐
│ Connectors                 │
│                            │
│ ── Cloud Storage ──        │
│ 📁 Google Drive    [● ON]  │
│ 📁 Dropbox         [○ OFF] │
│ 📁 OneDrive        [○ OFF] │
│                            │
│ ── Productivity ──         │
│ 📌 GitHub          [● ON]  │
│ 📌 Linear          [Connect]│
│ 📌 Jira            [Connect]│
│ 📌 Notion          [Connect]│
│                            │
│ ── Communication ──        │
│ 💬 Slack           [● ON]  │
│ 💬 Microsoft Teams [Connect]│
│                            │
│ ── Email & Calendar ──     │
│ 📧 Gmail           [Connect]│
│ 📅 Google Calendar [Connect]│
└───────────────────────────┘
```

**Launch connectors (v1):**

- Google: Drive, Gmail, Calendar
- GitHub, Linear, Jira
- Slack, Microsoft Teams
- Notion, Dropbox

**States:**

- Connected: Toggle ON (teal), tap to disconnect
- Available: "Connect" button, opens OAuth flow
- Each connector: service icon + name + description + toggle/button

---

## Settings

**5 groups, 18 items:**

```
┌───────────────────────────┐
│ Settings                   │
│                            │
│ ─ Account ─                │
│ Profile              >     │
│ Subscription         >     │
│ Usage                >     │
│                            │
│ ─ AI Configuration ─       │
│ Default Model        >     │
│ Capabilities         >     │
│ Auto-Approve         >     │
│                            │
│ ─ Connections ─            │
│ Desktop Pairing      >     │
│ Connectors           >     │
│                            │
│ ─ Preferences ─            │
│ Appearance     System >    │
│ Voice & Language     >     │
│ Notifications        >     │
│ Personalization      >     │
│ Haptic Feedback  [● ON]    │
│                            │
│ ─ About ─                  │
│ Help & FAQ           >     │
│ Privacy Policy       >     │
│ Terms of Service     >     │
│ Sign Out (red)             │
│ v1.0.0 Build 1             │
└───────────────────────────┘
```

**Sub-pages:**

- **Profile:** Name, nickname, avatar, email
- **Subscription:** Current plan, manage, restore purchases
- **Usage:** Progress bars (see Usage section)
- **Default Model:** Opens model selector to set default
- **Capabilities:** 4 toggles (see Capabilities section)
- **Auto-Approve:** Ask Always / Smart Auto / Full Auto
- **Desktop Pairing:** QR scanner, connection status, device name
- **Connectors:** Full connector list (same as nav page)
- **Appearance:** Dark / Light / System selector
- **Voice & Language:** Speech language, TTS voice selection
- **Notifications:** 3 toggleable categories
- **Personalization:** Full personalization page (see section)
- **Haptic Feedback:** Single toggle

---

## Personalization

**Full personalization page:**

```
┌───────────────────────────┐
│ ← Personalization    Save  │
│                            │
│ Full Name                  │
│ ┌────────────────────────┐ │
│ │ Siddhartha Nagula      │ │
│ └────────────────────────┘ │
│                            │
│ Nickname                   │
│ ┌────────────────────────┐ │
│ │ Sid                    │ │
│ └────────────────────────┘ │
│                            │
│ Occupation                 │
│ ┌────────────────────────┐ │
│ │ Founder & Engineer     │ │
│ └────────────────────────┘ │
│                            │
│ Custom Instructions        │
│ ┌────────────────────────┐ │
│ │ I prefer direct,       │ │
│ │ technical answers...   │ │
│ │                        │ │
│ └────────────────────────┘ │
│                            │
│ ── Response Style ──       │
│ Warmth        ○───●───○    │
│ Enthusiasm    ○───●───○    │
│ Headers/Lists ○───●───○    │
│ Emoji         ○──●────○    │
│                            │
│ Note: Preferences apply    │
│ to all conversations.      │
└───────────────────────────┘
```

- **Name + nickname:** Used in greetings and responses
- **Occupation:** Tailors responses to profession (e.g., "Engineer, student, lawyer")
- **Custom instructions:** Free text area for response preferences
- **Response style sliders:** 4 adjustable sliders (like ChatGPT)
  - Warmth: Cold ← Default → Warm
  - Enthusiasm: Neutral ← Default → Enthusiastic
  - Headers/Lists: Prose ← Default → Structured
  - Emoji: None ← Default → Frequent

---

## Usage & Billing

**Pattern:** Progress bars like Claude

```
┌───────────────────────────┐
│ Usage                      │
│                            │
│ Current session            │
│ ██░░░░░░░░░░░  12% used   │
│ Resets in 4h 58m           │
│                            │
│ Monthly limits             │
│ █████░░░░░░░░  42% used   │
│ Resets Apr 1               │
│                            │
│ API spend: $12.40 / $50    │
│                            │
│ ─────────────────────────  │
│ Manage Subscription   >    │
│ Restore Purchases     >    │
└───────────────────────────┘
```

- Current session: progress bar + % + reset countdown
- Monthly limits: progress bar + % + reset date
- API spend: dollar amount / budget cap
- Links to manage subscription and restore purchases

---

## Authentication & Onboarding

### Onboarding (3 screens + auth)

**Screen 1: Welcome**

```
┌───────────────────────────┐
│                            │
│         ✨ (logo)          │
│                            │
│    AGI Workforce           │
│    One app, every model,   │
│    total control.          │
│                            │
│    [Get Started]           │
│    [Sign In]               │
│         • • •              │
└───────────────────────────┘
```

**Screen 2: Multi-model**

- Highlight: 9+ providers, any model
- Provider logos grid

**Screen 3: Desktop companion**

- Highlight: Control your desktop AI from your phone
- Phone + desktop illustration

### Auth Screen

```
┌───────────────────────────┐
│                            │
│ Sign in to AGI Workforce   │
│                            │
│ [  Apple Sign In    ]      │
│ [  Google Sign In   ]      │
│                            │
│ ── or ──                   │
│                            │
│ Email _______________      │
│ Password _____________     │
│                            │
│ [Sign In]                  │
│ Don't have an account?     │
│ Sign Up                    │
└───────────────────────────┘
```

**Auth methods:**

1. Sign in with Apple (native iOS, required by App Store)
2. Sign in with Google (PKCE via expo-web-browser)
3. Email + password (Supabase auth)

**After auth first launch:** Empty chat with greeting + dismissible desktop pairing banner.

---

## Push Notifications

**3 toggleable categories** (Settings > Notifications):

1. **Task complete** — When a Dispatch task finishes on desktop
2. **Chat responses ready** — When a long-running AI response completes
3. **Approval needed** — When an agent action needs approve/deny

Each category independently toggleable. All ON by default.

**Implementation:** expo-notifications → POST /api/mobile/push-token on registration.

---

## Image Generation

**Available in v1** — cloud-routed, inline in chat.

- Route to cloud image gen APIs (managed, no BYOK)
- Generated images appear as inline tappable cards in chat
- Tap to view full-screen with zoom, share, save options
- No dedicated Images tab (unlike ChatGPT) — images are part of the conversation flow

---

## Scheduling

**Full scheduling from mobile** — tasks run on desktop or cloud.

- Create, edit, manage scheduled tasks
- Schedule by: specific time, recurring (cron), or trigger-based
- Tasks execute on paired desktop (must be awake) or cloud
- View all scheduled tasks in Dispatch page
- Push notification when scheduled task completes

---

## Memory

**Shared cloud memory** via Supabase.

- Mobile and desktop share the same memory store
- AI remembers context from conversations on both surfaces
- View/manage memory in Settings > AI Configuration > Capabilities
- Toggle: "Generate memory from chat history" ON/OFF
- View memory: card showing last update + chevron to full memory page

---

## iPad Support

**Adaptive layout:**

- **iPhone:** Drawer `type='front'` (slides over content, width < 768px)
- **iPad:** Drawer `type='permanent'` (always-visible sidebar, width >= 768px)

```
iPad layout:
┌──────────┬────────────────────────┐
│ ☰ AGI    │                        │
│          │   Chat content area    │
│ 📬 Chat  │                        │
│ ⚡ Skills│                        │
│ 📁 Proj  │   Good morning, Sid    │
│ 💻 Disp  │   How can I help?      │
│ 🔗 Conn  │                        │
│ ⚙️ Set   │                        │
│          │────────────────────────│
│ Recents  │ [+][pill][🧠]  [🎙][➤] │
│ ...      │                        │
└──────────┴────────────────────────┘
```

---

## Offline Mode

**View history offline** — past conversations cached in MMKV.

- Browse and read past conversations without internet
- New messages require active internet connection
- Clear offline indicator: "You're offline — viewing cached conversations"
- Graceful degradation: grayed-out input bar when offline
- Auto-reconnect when internet returns

---

## Capabilities Toggles

**Settings > AI Configuration > Capabilities:**

```
┌───────────────────────────┐
│ Capabilities               │
│                            │
│ 🌐 Web search      [● ON] │
│ AI searches the web when   │
│ it needs current info      │
│                            │
│ 🎨 Image generation [● ON] │
│ Generate images inline     │
│ in conversations           │
│                            │
│ 🧠 Memory           [● ON] │
│ Remember context from      │
│ past conversations         │
│                            │
│ 💻 Desktop control  [● ON] │
│ Remote control desktop     │
│ via Dispatch (requires     │
│ paired desktop)            │
└───────────────────────────┘
```

All ON by default. Each independently toggleable.

---

## Backend API

**No new backend needed.** All existing web APIs at agiworkforce.com:

```
Auth: Bearer <supabase_access_token> on all routes

GET  /api/chat/conversations           — list conversations
POST /api/chat/conversations           — create conversation
GET  /api/chat/conversations/[id]      — get conversation
PUT  /api/chat/conversations/[id]      — rename conversation
DEL  /api/chat/conversations/[id]      — delete conversation
POST /api/chat/conversations/[id]/messages — save message
POST /api/llm/v1/chat/completions      — SSE streaming LLM
POST /api/mobile/register              — register device
POST /api/mobile/push-token            — update push token
POST /api/mobile/pairing-code          — get pairing code
```

**Streaming:** fetch + ReadableStream (RN 0.76+), fallback to react-native-fetch-event-source.
**SSE format:** `data: {"choices":[{"delta":{"content":"..."}}]}`
**Stop generation:** AbortController

---

## What's NOT in v1

| Feature                             | Reason                                        | Planned        |
| ----------------------------------- | --------------------------------------------- | -------------- |
| BYOK (Bring Your Own Key)           | Simpler onboarding, consistent billing        | v2             |
| Messaging (WhatsApp/Telegram/Slack) | Complex server infrastructure                 | v2             |
| Local LLMs (Ollama/LM Studio)       | Mobile doesn't run local models               | v2 if demanded |
| Agents Dashboard (card grid)        | Over-engineered; Dispatch covers the use case | Revisit later  |
| Magic link auth                     | 3 auth methods sufficient for launch          | v2             |
| Commerce/Orders                     | Not our focus (Perplexity feature)            | Not planned    |
| Auto-approve in input bar           | Not needed on mobile (settings only)          | Not planned    |
| Quick chips on empty state          | Decided on minimal empty state                | Not planned    |

---

## Competitive Advantages

| Feature                     | Us  | Claude        | ChatGPT | Gemini | Perplexity |
| --------------------------- | --- | ------------- | ------- | ------ | ---------- |
| Multi-provider models       | 9+  | 1             | 1       | 1      | 7          |
| Push on task complete       | ✅  | ❌            | ❌      | ❌     | ❌         |
| 150+ non-coding skills      | ✅  | ❌            | ❌      | ❌     | ❌         |
| Skills from attachment menu | ✅  | ❌            | ❌      | ❌     | ❌         |
| Full scheduling from mobile | ✅  | Separate      | ❌      | ❌     | ❌         |
| Shared cloud memory         | ✅  | ✅            | ❌      | ❌     | ❌         |
| Multi-agent visibility      | ✅  | Single thread | ❌      | ❌     | ❌         |
| Connectors (v1)             | 10+ | 5             | Apps    | ❌     | 19         |
| Image gen inline            | ✅  | ❌            | Tab     | ✅     | ❌         |
| Personalization sliders     | ✅  | ❌            | ✅      | ❌     | ❌         |

---

## Build Phases

### Phase 0: Scaffold (~30 files)

- Expo project setup with monorepo integration
- Directory structure: app/, components/, stores/, services/, lib/, types/
- NativeWind config, MMKV adapter, global.css
- Metro watchFolders for shared packages

### Phase 1: Auth + Navigation (~12 files)

- Root layout with GestureHandlerRootView + SafeAreaProvider
- 3-screen onboarding flow
- Auth: email/password + Apple + Google
- Drawer navigation (6 items, adaptive iPhone/iPad)
- Auth guard with redirect logic

### Phase 2: Chat Core (~15 files)

- SSE streaming with fetch + ReadableStream
- Message list with FlashList
- Input bar (full-featured: +, model pill, brain, mic, send/stop)
- Dark bubble user messages, left-aligned AI responses
- Thinking bottom sheet (collapsed line → "Thought process" sheet)
- Streaming cursor (AGI Workforce logo animation)
- During-streaming state (Reply to [model] + stop button)

### Phase 3: Model Selection (~8 files)

- Model selector bottom sheet (50%/90% snap)
- 3 auto modes (Economy/Balanced/Premium)
- Provider-grouped list with brand icons
- Brain toggle for thinking mode
- Favorites + recents + search
- Model pill in input bar

### Phase 4: Attachments + Artifacts (~6 files)

- Attachment sheet (Photo, Camera, File, Skills)
- Inline artifact cards with full-screen overlay
- Image display for generated images
- Web search citations (collapsible sources)

### Phase 5: Voice (~8 files)

- Tap mic → Whisper transcription → text input
- Long-press → full-screen voice mode with waveform + TTS
- expo-av recording integration

### Phase 6: Dispatch (Desktop Companion) (~10 files)

- QR code scanner (expo-camera)
- WebRTC DataChannel via react-native-webrtc
- Persistent thread UI (connection status, task results)
- Push notifications (expo-notifications)
- File result cards ([Preview] [Open on Mac])

### Phase 7: Skills + Projects (~10 files)

- Skills browser: category grid, search, skill list, pre-loaded chat
- Projects: card list, Chats/Sources tabs, project-scoped chat

### Phase 8: Connectors (~6 files)

- Toggle list UI with categories
- OAuth flows for each service
- Connected/available states

### Phase 9: Settings + Personalization (~12 files)

- Full settings page (5 groups, 18 items)
- Personalization page (name, nickname, occupation, instructions, sliders)
- Usage page with progress bars
- Capabilities toggles
- Auto-approve configuration
- Appearance selector

### Phase 10: Scheduling + Memory (~8 files)

- Schedule creation/edit from mobile
- Shared cloud memory (Supabase)
- Memory view/manage page

### Phase 11: Polish (~6 files)

- Offline mode (MMKV caching)
- Conversation management (date groups, swipe, pin, archive)
- Message interactions (long-press, swipe-reply, double-tap react)
- Haptic feedback throughout
- iPad adaptive layout testing

**Estimated total: ~130 files across 12 phases**

---

## Design References

Competitive analysis from live iOS screenshots (March 2026):

- Claude iOS (Max): `memory/claude-mobile-ios-march2026.md`
- ChatGPT Plus iOS: `memory/chatgpt-mobile-march2026.md`
- Gemini Pro iOS: `memory/gemini-mobile-ios-march2026.md`
- Perplexity Pro iOS: `memory/perplexity-mobile-march2026.md`

Sources:

- [Claude Dispatch Help](https://support.claude.com/en/articles/13947068-assign-tasks-to-claude-from-anywhere-in-cowork)
- [Get Started with Cowork](https://support.claude.com/en/articles/13345190-get-started-with-cowork)
- [Claude Cowork Product](https://claude.com/product/cowork)
