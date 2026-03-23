# AGI Workforce — UI Redesign Specification

> **Version**: 1.0
> **Date**: March 22, 2026
> **Status**: Approved — Ready for Development
> **Scope**: Desktop (Tauri) + Web (/chat) — shared codebase
> **Reference**: Claude.ai is the primary design reference. ChatGPT and Gemini are secondary.
> **Principle**: Everything inline. Fewer elements that actually work. Multi-model on top of Claude.ai simplicity.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Layout System](#2-layout-system)
3. [Sidebar](#3-sidebar)
4. [Empty State](#4-empty-state)
5. [Input Bar](#5-input-bar)
6. [Model Selector](#6-model-selector)
7. [Plus Menu](#7-plus-menu)
8. [Conversation Header](#8-conversation-header)
9. [Message Rendering](#9-message-rendering)
10. [Thinking & Tool Calls](#10-thinking--tool-calls)
11. [Web Search & Citations](#11-web-search--citations)
12. [Image & Video Generation](#12-image--video-generation)
13. [Artifact Panel](#13-artifact-panel)
14. [Projects](#14-projects)
15. [Customize Hub](#15-customize-hub)
16. [Skills System](#16-skills-system)
17. [Connector Marketplace](#17-connector-marketplace)
18. [Settings](#18-settings)
19. [Command Palette](#19-command-palette)
20. [User Profile](#20-user-profile)
21. [Design Tokens](#21-design-tokens)
22. [Typography](#22-typography)
23. [Themes](#23-themes)
24. [Animations & Transitions](#24-animations--transitions)
25. [Differentiators](#25-differentiators)
26. [Mobile Alignment](#26-mobile-alignment)
27. [Shared Package Structure](#27-shared-package-structure)
28. [Migration Plan](#28-migration-plan)

---

## 1. Architecture

### Shared Codebase

Desktop (Tauri) and web (/chat) share the **same React chat components** via a new shared package.

```
packages/chat/                  # NEW — shared chat UI package
├── components/
│   ├── ChatInterface.tsx       # Main layout orchestrator
│   ├── Sidebar.tsx             # 7-item sidebar
│   ├── MessageList.tsx         # Message stream
│   ├── MessageBubble.tsx       # Individual message
│   ├── ChatInput.tsx           # Input bar + toolbar
│   ├── ModelSelector.tsx       # Multi-provider model picker
│   ├── PlusMenu.tsx            # + button menu (7 items)
│   ├── ThinkingBlock.tsx       # Collapsible thinking/tool timeline
│   ├── ArtifactPanel.tsx       # Right panel for artifacts
│   ├── ConversationHeader.tsx  # Title + share
│   ├── EmptyState.tsx          # Greeting + quick chips
│   ├── QuickChips.tsx          # Code, Write, Research, Skills, Web
│   └── ...
├── stores/
│   ├── chatStore.ts            # Conversations, messages, streaming
│   ├── modelStore.ts           # Model selection, providers, BYOK
│   ├── uiStore.ts              # Sidebar, panels, theme
│   └── ...
├── hooks/
│   ├── useChat.ts              # Send, stream, retry
│   ├── useModel.ts             # Model switching
│   ├── useTheme.ts             # Theme access
│   └── ...
├── lib/
│   ├── tokens.ts               # Design tokens
│   ├── utils.ts                # cn(), formatters
│   └── types.ts                # Shared interfaces
└── package.json
```

### Platform Integration

```
apps/desktop/src/               # Tauri shell
├── App.tsx                     # Imports ChatInterface from @agiworkforce/chat
├── tauri/                      # Window controls, IPC, system tray
│   ├── TitleBar.tsx            # Tauri window drag region + controls
│   ├── ipc.ts                  # invoke() wrappers
│   └── systemTray.ts
└── desktop-only/               # Features requiring native APIs
    ├── ScreenCapture.tsx
    ├── ComputerUse.tsx
    └── LocalLLM.tsx

apps/web/app/chat/              # Next.js route (EMBEDDED, not SPA redirect)
├── layout.tsx                  # Auth guard + chat shell
├── page.tsx                    # Imports ChatInterface from @agiworkforce/chat
└── web-only/                   # Web-specific adapters
    ├── auth.ts                 # Supabase session (cookie, no hash)
    ├── streaming.ts            # SSE via /api/llm/* routes
    └── storage.ts              # localStorage adapter
```

### Runtime Detection

The shared package uses a runtime adapter pattern:

```typescript
// packages/chat/lib/runtime.ts
interface ChatRuntime {
  sendMessage(params: SendParams): AsyncIterable<StreamChunk>;
  uploadFile(file: File): Promise<FileRef>;
  invokeCommand(cmd: string, args: Record<string, unknown>): Promise<unknown>;
  getStorage(): StorageAdapter;
  getPlatform(): 'desktop' | 'web' | 'mobile';
}
```

- **Desktop**: Runtime calls `invoke()` for Tauri commands, uses Tauri event channels for streaming
- **Web**: Runtime calls `/api/llm/*` routes, uses SSE for streaming
- **Mobile**: Runtime calls Express API Gateway, uses fetch-based SSE

---

## 2. Layout System

### Default: 2-Panel

```
┌──────────────────────────────────────────────────────────┐
│                    TitleBar (desktop only)                │
├──────────┬───────────────────────────────────────────────┤
│          │                                               │
│ Sidebar  │              Chat Area                        │
│ (260px)  │                                               │
│          │  [ConversationHeader]                          │
│ + New    │                                               │
│ Search   │  [MessageList]                                │
│ Custom.  │    - Messages inline                          │
│ Chats    │    - Thinking inline (collapsible)            │
│ Projects │    - Images inline                            │
│ Skills   │    - Tables inline                            │
│ Connect. │    - Citations inline                         │
│          │    - Web search results inline                │
│ Recents  │                                               │
│  • Conv1 │  [ChatInput]                                  │
│  • Conv2 │    [+] | textarea | [A] Model v | 🎙          │
│  • Conv3 │                                               │
│          │  [Disclaimer]                                  │
│ User     │    "AI can make mistakes..."                  │
│  Name    │                                               │
│  Plan    │                                               │
└──────────┴───────────────────────────────────────────────┘
```

### On-Demand: 3-Panel (Artifact Panel)

Triggers for right panel opening:

1. **Code/HTML preview** — Interactive HTML artifacts, React components
2. **Document creation** — Generated DOCX, PDF, presentations
3. **Research reports** — Deep research output documents
4. **User explicit request** — User clicks "Open in panel" on any inline artifact

```
┌──────┬──────────────────────┬────────────────────────────┐
│Icons │    Chat Area          │      Artifact Panel        │
│(52px)│    (narrows)          │      (400-500px)           │
│      │                       │                            │
│ +    │  [Messages]           │  [👁 Preview] [</> Code]   │
│ 🔍   │                       │  Title · Type              │
│ 🎨   │                       │  [Copy] [▾] [↻] [✕]       │
│ 💬   │                       │                            │
│ 📁   │                       │  ┌──────────────────────┐  │
│ ⚡   │                       │  │                      │  │
│ 🔌   │                       │  │  Live Interactive    │  │
│      │                       │  │  Preview / Code      │  │
│ 👤   │  [Input Bar]          │  │                      │  │
│      │                       │  └──────────────────────┘  │
└──────┴──────────────────────┴────────────────────────────┘

Sidebar auto-collapses to 52px icons when artifact panel opens.
Artifact panel: 400px default, resizable 280-900px.
```

### Panel Rules

- **Default**: 2-panel (sidebar + chat). No right panel.
- **Everything inline**: Images, tables, code blocks, thinking, citations — all render in the message stream.
- **Artifact panel**: ONLY opens for the 4 triggers listed above. Never auto-opens for regular text responses.
- **One panel at a time**: Only one right panel can be open (artifact OR project detail).
- **Sidebar collapses**: When any right panel opens, sidebar collapses to icon-only (52px).
- **Resizable**: Both sidebar (200-400px) and artifact panel (280-900px) have drag handles.

---

## 3. Sidebar

### Structure (7 nav items + recents + user profile)

```
┌─────────────────────────┐
│ ◧  (PanelLeft toggle)   │  ← Collapse/expand sidebar
├─────────────────────────┤
│ [+] New Chat      ⇧⌘O  │  ← Creates new conversation
│ 🔍 Search               │  ← Full-text conversation search
│ 🎨 Customize            │  ← Opens Skills/Connectors hub
│ 💬 Chats                │  ← All conversations view
│ 📁 Projects             │  ← Projects list
│ ⚡ Skills               │  ← 150+ skill browser
│ 🔌 Connectors           │  ← Connected services
├─────────────────────────┤
│ Recents                 │  ← Label
│  • Conversation 1       │  ← Active: highlighted bg
│  • Conversation 2       │  ← Hover: show actions
│  • Conversation 3       │
│  • Conversation 4       │
│  • Conversation 5       │
│  ...                    │  ← Scrollable
├─────────────────────────┤
│ 👤 Siddhartha Nagula    │  ← Avatar + name
│    Pro plan             │  ← Plan badge
└─────────────────────────┘
```

### Expanded State (260px)

- Full text labels next to icons
- Recents list shows conversation titles with relative timestamps
- User profile shows avatar, name, plan badge

### Collapsed State (52px)

- Icons only, no text labels
- Tooltips appear on hover with label text
- Recents section hidden
- User profile shows avatar only

### Collapse Animation

- **Duration**: 200ms ease-out
- **Behavior**: Width transitions from 260px → 52px. Text labels fade out at 50% of transition. Chat area smoothly expands to fill space.
- **Trigger**: PanelLeft icon toggle (top of sidebar)
- **Auto-collapse**: When artifact panel opens, sidebar auto-collapses to 52px

### Conversation Item

Each conversation in the recents list:

```
┌─────────────────────────┐
│ 💬 Conversation Title    │  ← Click to open
│    2 hours ago           │  ← Relative timestamp
└─────────────────────────┘

Hover state:
┌─────────────────────────┐
│ 💬 Conversation Title ⋯  │  ← Three-dot menu appears
│    2 hours ago           │
└─────────────────────────┘
```

**Three-dot menu**: Rename, Move to project, Archive, Export, Delete
**Active state**: Subtle highlight background (border-left accent or bg tint)
**Context menu** (right-click): Same as three-dot menu + Pin/Unpin

### Temporal Grouping

Conversations are grouped:

- **Pinned** (pin icon, always at top)
- **Today**
- **Yesterday**
- **This Week**
- **This Month**
- **Older**

---

## 4. Empty State

### Greeting

Playful, rotating, time-aware greetings with the app brand sparkle icon:

```
              ✨  (brand sparkle icon, animated subtle pulse)

         Moonlit chat?  🌙

    ┌──────────────────────────────────┐
    │  How can I help you today?       │
    ├──────────────────────────────────┤
    │ [+]     [A] Opus 4.6 Extended v 🎙│
    └──────────────────────────────────┘

    [</> Code]  [✏ Write]  [🔬 Research]
    [⚡ Skills]  [🌐 Web]
```

### Greeting Variants (rotate randomly)

| Time              | Variants                                                                   |
| ----------------- | -------------------------------------------------------------------------- |
| Morning (5-12)    | "Good morning, {name}", "Ready to build?", "What's on the agenda?"         |
| Afternoon (12-17) | "Good afternoon, {name}", "What are we tackling?", "Let's get things done" |
| Evening (17-21)   | "Good evening, {name}", "What's on your mind?", "Evening plans?"           |
| Night (21-5)      | "Working late, {name}?", "Moonlit chat?", "Night owl mode"                 |

- `{name}` uses the user's preferred nickname (from Settings > General > Profile)
- Greeting changes on each new chat creation, not on page reload
- If no nickname set, omit the name: "Good morning" instead of "Good morning, {name}"

### Quick Chips

5 chips in a horizontal row below the input bar:

| Chip     | Icon  | Action                                             |
| -------- | ----- | -------------------------------------------------- |
| Code     | `</>` | Sets focus mode to Code, suggests coding prompts   |
| Write    | ✏     | Sets focus mode to Write, suggests writing prompts |
| Research | 🔬    | Activates Research mode (deep research agent)      |
| Skills   | ⚡    | Opens skill browser / suggests skill-based prompts |
| Web      | 🌐    | Enables web search toggle                          |

- Chips disappear once user starts typing or sends first message
- Chips are styled as outlined pills with icon + label
- Click triggers the associated mode/action

---

## 5. Input Bar

### Layout

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  How can I help you today?                               │  ← Placeholder text
│  (or "Reply..." during conversation)                     │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [+]                    [A] Opus 4.6 Extended v        🎙 │  ← Bottom toolbar
└──────────────────────────────────────────────────────────┘
  ↑ plus menu            ↑ model selector              ↑ voice
```

### Input Textarea

- **Placeholder (new chat)**: "How can I help you today?"
- **Placeholder (in conversation)**: "Reply..."
- **Placeholder (with slash)**: "Type / for skills"
- Auto-expands vertically as user types (max 200px height)
- Supports markdown formatting, paste images, drag-and-drop files
- `@` triggers mention picker (skills, files)
- `/` triggers slash command menu

### Bottom Toolbar

Left to right:

1. **[+] button** — Opens plus menu (see section 7)
2. **Model selector** — Provider icon + model name + "v" chevron (see section 6)
3. **Voice icon** 🎙 — Microphone for voice input

### During Streaming

```
┌──────────────────────────────────────────────────────────┐
│  Reply...                                                │
├──────────────────────────────────────────────────────────┤
│ [+]                    [A] Opus 4.6 Extended v     [■]   │
└──────────────────────────────────────────────────────────┘
                                                      ↑ stop button replaces mic
```

- Voice icon replaced by **Stop button** (■ square) during streaming
- Click stop to cancel generation
- Input remains editable during streaming

### Voice Recording State

```
┌──────────────────────────────────────────────────────────┐
│  ▐█▄▀▄▀█▄▀▌  Listening...                      [■ Stop] │
└──────────────────────────────────────────────────────────┘
```

- Waveform visualization replaces input area
- "Listening..." text
- Stop button to end recording
- Transcribed text appears in input after recording stops

---

## 6. Model Selector

### Display in Input Bar

```
[A] Opus 4.6 Extended v
 ↑   ↑         ↑      ↑
 │   model     mode   chevron
 provider icon
```

- **Provider icon**: Small branded icon (Anthropic "A", OpenAI logo, Google "G", monitor for local)
- **Model name**: Short name without provider prefix
- **Mode suffix**: "Extended" when extended thinking is enabled
- **Chevron**: "v" dropdown indicator

### Dropdown Structure

```
┌──────────────────────────────────┐
│ ⭐ Auto                          │  ← Smart router (picks best model)
│    Best model for your task      │
├──────────────────────────────────┤
│ FLAGSHIP                         │  ← Tier header
│ [A] Opus 4.6              BYOK  │  ← ✓ if selected, BYOK badge if user's key
│ [O] GPT-4o                BYOK  │
│ [G] Gemini 3.1 Pro        BYOK  │
├──────────────────────────────────┤
│ STANDARD                         │
│ [A] Sonnet 4.6             BYOK │
│ [O] GPT-4o mini            BYOK │
│ [G] Gemini 3.1 Flash       BYOK │
├──────────────────────────────────┤
│ FAST                             │
│ [A] Haiku 4.5              BYOK │
├──────────────────────────────────┤
│ LOCAL                            │  ← Only shows if Ollama/LM Studio detected
│ [🖥] Llama 3.3           🖥 Local│
│ [🖥] Mistral 7B          🖥 Local│
├──────────────────────────────────┤
│ Extended thinking       [● ON]   │  ← Toggle, persists per model
│ More models >                    │  ← Opens submenu for legacy models
└──────────────────────────────────┘
```

### Provider Icons

Use the actual brand icons for each provider:

- **Anthropic**: Anthropic "A" mark
- **OpenAI**: OpenAI logo
- **Google**: Google "G" mark
- **Local**: Monitor icon (🖥)
- **Mistral**: Mistral logo
- **Meta**: Meta logo (for Llama)

### Badges

| Badge | Meaning                                | Style                           |
| ----- | -------------------------------------- | ------------------------------- |
| BYOK  | Using user's own API key               | Small muted text, right-aligned |
| Local | Running on device via Ollama/LM Studio | Small badge with monitor icon   |
| ✓     | Currently selected model               | Checkmark, accent color         |

### Extended Thinking Toggle

- Toggle switch inside dropdown, below model list
- State persists per model (some models support it, some don't)
- When enabled, input bar shows "Extended" suffix: `[A] Opus 4.6 Extended v`
- When model doesn't support thinking, toggle is grayed out with tooltip

---

## 7. Plus Menu

### Structure (7 items)

Triggered by clicking the [+] button in the input bar bottom-left.

```
┌──────────────────────────────────┐
│ 📎 Add files or photos           │  ← File picker (images, docs, PDFs)
├──────────────────────────────────┤
│ ⚡ Skills >                      │  ← Submenu: list of all skills + "Manage skills"
│ 🔌 Connectors >                 │  ← Submenu: per-connector toggles + "Manage"
│ 🔬 Research                     │  ← Triggers deep research mode
│ 🌐 Web search              ✓   │  ← Toggle (✓ = enabled). Green check when on.
│ 🎨 Create image                 │  ← Activates image generation mode
│ 🎬 Create video                 │  ← Activates video generation mode
└──────────────────────────────────┘
```

### Skills Submenu

```
┌──────────────────────────────────┐
│ ⚡ Skills                        │
├──────────────────────────────────┤
│ My Skills                        │
│  • humanizer                     │
│  • legal-ai                      │
│  • medical-notes                 │
├──────────────────────────────────┤
│ Recently Used                    │
│  • web-artifacts-builder         │
│  • doc-coauthoring               │
├──────────────────────────────────┤
│ Manage skills                    │  ← Opens Customize hub > Skills tab
└──────────────────────────────────┘
```

### Connectors Submenu

```
┌──────────────────────────────────┐
│ 🔌 Connectors                   │
├──────────────────────────────────┤
│ Gmail                    [ON]   │  ← Per-conversation toggle
│ Google Drive             [OFF]  │
│ GitHub                   [ON]   │
│ Vercel                   [ON]   │
├──────────────────────────────────┤
│ Manage connectors               │  ← Opens Customize hub > Connectors tab
│ Tool access → Load when needed  │  ← Configurable in Settings > Capabilities
└──────────────────────────────────┘
```

### Behavior

- **Web search**: Toggle on/off per conversation. Green checkmark when enabled.
- **Research**: Opens deep research mode — long-running background agent.
- **Create image / Create video**: Activates the respective generation pipeline. Input placeholder changes contextually.
- **Skills/Connectors submenus**: Show only relevant items. "Manage" links to Customize hub.

---

## 8. Conversation Header

### Layout

```
┌──────────────────────────────────────────────────────────┐
│           SpaceX Starship Analysis v              ⇡ Share│
└──────────────────────────────────────────────────────────┘
                    ↑ title + dropdown               ↑ share button
```

### Title

- **Auto-generated** from first user message (AI summarizes into short title)
- **Clickable dropdown chevron** (v) opens menu
- **Editable**: Click title text to rename inline

### Title Dropdown Menu

```
┌────────────────────────┐
│ ✏ Rename               │
│ 📁 Move to project >   │  ← Submenu: list of projects
│ 📦 Archive             │
│ 📤 Export >             │  ← Submenu: Markdown, JSON, PDF
│ 🗑 Delete               │  ← Destructive, requires confirmation
└────────────────────────┘
```

### Share Button

- Appears after first assistant response
- Opens share modal: Copy link, Create public link, Export
- Icon: ⇡ (share/upload icon)

### New Chat (no header)

When no conversation is active (empty state), the header area is empty — the greeting fills the chat area.

---

## 9. Message Rendering

### User Message

```
┌──────────────────────────────────────────────────────────┐
│                                    ┌───────────────────┐ │
│                                    │ User message text  │ │
│                                    │ with markdown      │ │
│                                    └───────────────────┘ │
│                                              12:34 PM    │
└──────────────────────────────────────────────────────────┘
```

- Right-aligned bubble with warm dark background (#2a2724)
- Supports markdown, code blocks, images
- Timestamp below, right-aligned, muted

### Assistant Message

````
┌──────────────────────────────────────────────────────────┐
│ [ThinkingBlock — collapsible]                            │
│                                                          │
│ Response text with **rich markdown** formatting.         │
│                                                          │
│ | Column 1 | Column 2 | Column 3 |                      │  ← Tables inline
│ |----------|----------|----------|                      │
│ | Data     | Data     | Data     |                      │
│                                                          │
│ ```python                                                │  ← Code blocks inline
│ def hello():                                             │
│     print("world")                                       │
│ ```                                    [📋 Copy]         │
│                                                          │
│ The results show [Space.com] that significant             │  ← Inline citations
│ progress was made [Reuters] [SpaceNews].                 │
│                                                          │
│ [📋 Copy] [👍] [👎] [🔄 Retry]                           │  ← Action bar
└──────────────────────────────────────────────────────────┘
````

- Left-aligned, no bubble (text on background)
- Full-width within chat content area
- Rich markdown: headers, bold, italic, lists, tables, code blocks
- Tables render inline — full width, clean borders
- Code blocks: syntax highlighting + copy button
- Images: inline, full width (see section 12)

### Action Bar

4 icons, left-aligned below every assistant response:

| Icon           | Action            | Behavior                                      |
| -------------- | ----------------- | --------------------------------------------- |
| 📋 Copy        | Copy response     | Copies markdown to clipboard                  |
| 👍 Thumbs up   | Positive feedback | Highlights on click, sends feedback           |
| 👎 Thumbs down | Negative feedback | Opens feedback form (optional reason)         |
| 🔄 Retry       | Regenerate        | Re-sends last user message, replaces response |

- Icons are muted by default, accent color on hover
- Always visible (not hover-only) for accessibility

### Disclaimer

Context-aware, centered at the very bottom of the chat area:

| Context        | Text                                                       |
| -------------- | ---------------------------------------------------------- |
| Default        | "AI can make mistakes. Please double-check responses."     |
| With citations | "AI can make mistakes. Please double-check cited sources." |
| With code      | "AI can make mistakes. Please review generated code."      |

- Small font, muted color, centered
- Fixed at bottom below input bar

---

## 10. Thinking & Tool Calls

### Pattern: Claude-Style Inline Collapsible

Follow Claude.ai's thinking block pattern exactly. All thinking, tool calls, and intermediate steps render **inline** in the message stream (NOT in a side panel).

### In-Progress (Streaming)

```
┌──────────────────────────────────────────────────────────┐
│ ✳ (brand sparkle, animated spinner)                      │
│                                                          │
│ Then transitions to:                                     │
│                                                          │
│ Synthesizing project architecture...                  v  │  ← Dynamic summary + chevron
│                                                          │
│ │ ⏱ The user wants me to analyze the...                 │  ← Clock icon + thinking text
│ │ 📄 Reading project files                               │  ← Document icon + action
│ │   [Result]                                             │  ← Green pill badge (collapsible)
│ │ ⏱ Let me examine the dependencies...                  │
│ │ 📦 Installing packages                                 │  ← Terminal icon + action
│ │   [Script]                                             │  ← Gray pill badge
│ │ 📝 Creating component.tsx                              │  ← Code icon + filename
│ │   [component.tsx]                                      │  ← Gray pill badge with filename
│ │ ⏱ Now let me validate...                              │
│ │ (cursor blinking — still processing)                   │
└──────────────────────────────────────────────────────────┘
```

### Completed (Collapsed — Default)

```
┌──────────────────────────────────────────────────────────┐
│ Synthesized project architecture and generated code   >  │
└──────────────────────────────────────────────────────────┘
```

One-line summary + `>` chevron to expand. Clicking expands to show full timeline.

### Completed (Expanded)

```
┌──────────────────────────────────────────────────────────┐
│ Synthesized project architecture and generated code   v  │
│                                                          │
│ │ ⏱ The user wants me to analyze the project...         │
│ │ 📄 Reading project config files                        │
│ │   [Result]                                             │
│ │ ⏱ Dependencies look good. Let me create...            │
│ │ 📦 Running npm install                                 │
│ │   [Script]                                             │
│ │ 📝 Creating src/App.tsx                                │
│ │   [App.tsx]                                            │
│ │ 📦 Running tests                                       │
│ │   [Script]                                             │
│ │ ⏱ All tests passing. Done.                            │
│ │ ✅ Done                                                │
└──────────────────────────────────────────────────────────┘
```

### Icon Vocabulary

| Icon         | Meaning                 | Usage                                        |
| ------------ | ----------------------- | -------------------------------------------- |
| ✳ (animated) | AI is processing        | Initial spinner before thinking text appears |
| ⏱ Clock      | Thinking/reasoning      | Between tool calls, shows reasoning text     |
| 📄 Document  | Reading a file/skill    | File read operations                         |
| 📦 Terminal  | Running script/command  | Shell executions, package installs           |
| 📝 Code/Edit | Creating/writing a file | File creation, code generation               |
| 🌐 Globe     | Web search              | Search queries                               |
| 🔗 Link      | MCP tool call           | External tool invocations                    |
| ✅ Checkmark | Step completed          | "Done" indicator                             |

### Badge Types

| Badge          | Style               | Meaning                                         |
| -------------- | ------------------- | ----------------------------------------------- |
| [Result]       | Small green pill    | Tool result (collapsible, click to show output) |
| [Script]       | Small gray pill     | Script was executed                             |
| [filename.tsx] | Small gray pill     | File was created/read                           |
| [10 results]   | Right-aligned count | Web search result count                         |

### Connector Line

- **Vertical line** on the left side connecting all steps within a thinking block
- Steps read top-to-bottom like a timeline
- Line color: muted border color

### Multiple Thinking Blocks

When a response involves multiple phases (e.g., research then generation):

```
┌──────────────────────────────────────────────────────────┐
│ Researched project requirements                       >  │  ← First phase (collapsed)
├──────────────────────────────────────────────────────────┤
│ Generated implementation code                         >  │  ← Second phase (collapsed)
├──────────────────────────────────────────────────────────┤
│                                                          │
│ Here's the implementation...                             │  ← Final response text
└──────────────────────────────────────────────────────────┘
```

---

## 11. Web Search & Citations

### Web Search (Inline)

```
┌──────────────────────────────────────────────────────────┐
│ 🌐 SpaceX Starship news today 2026         10 results   │  ← Globe + query + count
│                                                          │
│  ▼ (expandable)                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 🔴 Space.com — Latest Starship Updates            │    │
│  │ 📰 Reuters — SpaceX Achieves New Milestone        │    │
│  │ 🚀 SpaceNews — IFT-7 Success Confirmed           │    │
│  │ ... 7 more                                        │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

- Globe icon + search query text + result count badge (right-aligned)
- Expandable card: rows of favicon + article title + domain
- Multiple searches stack vertically inline
- Inside thinking blocks when collapsed

### Inline Citations

```
The Starship program achieved significant milestones [Space.com]
including the successful landing [Reuters] [SpaceNews]. The booster
catch [Teslarati +1] was a breakthrough moment.
```

| Element       | Style                                               |
| ------------- | --------------------------------------------------- |
| Citation pill | Small rounded pill, muted background, subtle border |
| Font size     | Smaller than body text (~12px)                      |
| Click         | Opens source URL in new tab                         |
| "+N"          | Indicates N additional sources behind this citation |
| Hover         | Shows full title + URL preview tooltip              |

---

## 12. Image & Video Generation

### Image Generation (Inline)

**In-progress:**

```
┌──────────────────────────────────────────────────────────┐
│ 🎨 Creating image • Futuristic AI workspace             │
│                                                          │
│  ┌──────────────────────────────────────────┐            │
│  │                                          │            │
│  │   (progressive blur → sharp render       │            │
│  │    OR loading placeholder skeleton)      │            │
│  │                                          │            │
│  └──────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────┘
```

**Complete:**

```
┌──────────────────────────────────────────────────────────┐
│ 🎨 Image created • Futuristic AI workspace              │
│                                                          │
│  ┌──────────────────────────────────────────┐            │
│  │                                          │            │
│  │          (full resolution image)          │            │
│  │                                          │            │
│  └──────────────────────────────────────────┘            │
│                                                          │
│  [📋 Copy] [⬇ Download] [⋯ More]                        │
│                                                          │
│  [📋 Copy] [👍] [👎] [🔄 Retry]                          │  ← Standard action bar
└──────────────────────────────────────────────────────────┘
```

- **No separate images panel** — image lives in the chat stream
- **No artifact panel** for images — always inline
- Image action icons: Copy, Download, More (expand, edit prompt, share)

### Video Generation (Inline)

**In-progress:**

```
┌──────────────────────────────────────────────────────────┐
│ 🎬 Generating your video...                             │
│                                                          │
│  ┌──────────────────────────────────────────┐            │
│  │  🎬  Generating your video...            │            │
│  │      This can take 1-2 minutes           │            │
│  │      ████████░░░░░░░ 60%                 │            │
│  └──────────────────────────────────────────┘            │
│                                                          │
│  (User can keep chatting while video generates)          │
└──────────────────────────────────────────────────────────┘
```

**Complete:**

```
┌──────────────────────────────────────────────────────────┐
│ 🎬 Your video is ready!                                 │
│                                                          │
│  ┌──────────────────────────────────────────┐            │
│  │           ▶ (play button overlay)         │            │
│  │          (video thumbnail)                │            │
│  └──────────────────────────────────────────┘            │
│                                                          │
│  Plays inline — no modal, no new page.                   │
└──────────────────────────────────────────────────────────┘
```

---

## 13. Artifact Panel

### When It Opens

The artifact panel opens on the right side ONLY for:

1. Interactive HTML/React artifacts (live preview)
2. Generated documents (DOCX, PDF, PPTX)
3. Deep research report documents
4. When user clicks "Open in panel" on any inline element

### Panel Header

```
┌──────────────────────────────────────────────────────────┐
│ 👁  </>  │  Neon Calculator · HTML  │ 📋  ▾  ↻  ✕       │
│ ↑   ↑                                 ↑   ↑  ↑  ↑       │
│ preview code       title+type         copy menu retry close │
└──────────────────────────────────────────────────────────┘
```

| Element      | Action                                                  |
| ------------ | ------------------------------------------------------- |
| 👁 Eye       | Preview mode — live interactive render (iframe)         |
| </> Code     | Code mode — syntax highlighted source with line numbers |
| Title · Type | Artifact name + type label (HTML, DOCX, React, etc.)    |
| 📋 Copy      | Copy source code to clipboard                           |
| ▾ Dropdown   | Download, Publish artifact (public URL)                 |
| ↻ Retry      | Regenerate the artifact                                 |
| ✕ Close      | Close panel, sidebar re-expands                         |

### Preview Mode

- **Fully interactive sandboxed iframe** — buttons work, JS executes, animations play
- Sandbox: `allow-scripts allow-forms` (no `allow-same-origin` for security)
- Resize handle for panel width

### Code Mode

- Full source code with line numbers (gray, left-aligned)
- Syntax highlighting for HTML, CSS, JS, Python, etc.
- Scrollable, monospace font, dark background
- Copy button copies full source

### Download Card (Inline in Chat)

When an artifact is generated, a download card appears inline in the chat:

```
┌──────────────────────────────────────────────────────────┐
│  </>  Neon Calculator  ·  Code · HTML  │  ⬇ Download    │
└──────────────────────────────────────────────────────────┘
```

- Clicking the card also opens the artifact panel
- Download button saves the file locally

---

## 14. Projects

### Projects List Page

Accessible from sidebar > Projects.

```
┌──────────┬───────────────────────────────────────────────┐
│ Sidebar  │ Projects                    + New project     │
│          │                                               │
│          │ 🔍 Search projects...        Sort: Activity v │
│          │                                               │
│          │ ┌─────────────┐  ┌─────────────┐             │
│          │ │ 📁 roadmap   │  │ 📁 hackathon │             │
│          │ │ Product      │  │ Competition  │             │
│          │ │ roadmap      │  │ project      │             │
│          │ │ Updated 2d   │  │ Updated 5d   │             │
│          │ └─────────────┘  └─────────────┘             │
│          │                                               │
│          │ ┌─────────────┐  ┌─────────────┐             │
│          │ │ 📁 portfolio │  │ 📋 Example   │             │
│          │ │ Personal     │  │ project      │             │
│          │ │ site         │  │ (template)   │             │
│          │ │ Updated 1w   │  │              │             │
│          │ └─────────────┘  └─────────────┘             │
└──────────┴───────────────────────────────────────────────┘
```

- Grid layout, 2-3 columns
- Each card: folder icon + title + description + "Updated X ago"
- "Example project" badge on template projects
- Search + sort by activity

### Project Detail Page

```
┌──────────┬──────────────────────┬────────────────────────┐
│ Sidebar  │ ← All projects      │ Memory                 │
│          │                      │ Auto-generated context │
│          │ Project Name  ★ ⋯   │ from conversations.    │
│          │                      │ [Only you] [✏ Edit]    │
│          ├──────────────────────┤ Updated 2 days ago     │
│          │                      │                        │
│          │ Conversations        │ Instructions           │
│          │                      │ Custom instructions    │
│          │ 💬 Chat 1    2d ago  │ to tailor AI responses │
│          │ 💬 Chat 2    5d ago  │ for this project.      │
│          │ 💬 Chat 3    1w ago  │ [+ Add instructions]   │
│          │                      │                        │
│          ├──────────────────────┤ Files                  │
│          │                      │ 📄 requirements.pdf    │
│          │ ┌──────────────────┐ │ 📄 notes.md           │
│          │ │ New chat in      │ │ 🐙 github/repo       │
│          │ │ this project     │ │ [+ Upload]            │
│          │ │ [+] Model v  🎙  │ │ ████████░░ 94%       │
│          │ └──────────────────┘ │                        │
└──────────┴──────────────────────┴────────────────────────┘
```

### Right Sidebar Sections

1. **Memory** — Auto-populated from conversations. Privacy toggle ("Only you"). Edit button. Last updated timestamp.
2. **Instructions** — Custom instructions text area. Injected as system prompt for all conversations in this project.
3. **Files** — Upload PDFs, documents, text files. GitHub repos with GITHUB badge. Capacity bar showing usage.

---

## 15. Customize Hub

### Access

Clicking "Customize" in sidebar opens the Customize hub, which **replaces the chat area** (not a modal overlay).

### Layout: 3-Panel

```
┌──────────┬──────────────────┬────────────────────────────┐
│ Sidebar  │ [Skills] [Conn.] │ Skill/Connector Detail     │
│          │                  │                            │
│          │ 🔍 Search        │ humanizer                  │
│          │                  │ [ON ●] ⋯                   │
│          │ + Add new        │                            │
│          │                  │ Added by: You              │
│          │ MY SKILLS        │ Updated: 2 days ago        │
│          │  humanizer    ●  │ Invoked by: Auto           │
│          │  legal-ai     ●  │                            │
│          │  medical      ○  │ Description:               │
│          │                  │ Rewrites AI text to sound  │
│          │ EXAMPLES         │ more human-like...         │
│          │  web-builder     │                            │
│          │  mcp-builder     │ [👁 Preview] [</> Source]   │
│          │  doc-coauthor    │ ┌──────────────────────┐   │
│          │  skill-creator   │ │ SKILL.md preview     │   │
│          │  brand-guide     │ │ content...           │   │
│          │  canvas-design   │ └──────────────────────┘   │
│          │  slack-gif       │                            │
│          │  theme-factory   │ Allowed tools:             │
│          │  algo-art        │ Read, Write, Edit, Grep    │
│          │  internal-comms  │                            │
│          │                  │ Files: SKILL.md,           │
│          │                  │ README.md, reference/      │
└──────────┴──────────────────┴────────────────────────────┘
```

### Tabs

Top of middle panel: **[Skills]** | **[Connectors]**

Switching tabs changes the middle and right panels.

### Skills Tab

See section 16 for full skills system.

### Connectors Tab

- Connected connectors list with status indicators
- "Add connector" button → Opens connector marketplace modal
- Each connector shows: icon + name + connected/not-connected badge
- Clicking a connector shows detail in right panel

---

## 16. Skills System

### Skill List (Middle Panel)

- **My Skills** section — User-created skills with on/off toggles
- **Examples** section — Built-in templates (150+ for our differentiator)
- Search bar with real-time filtering
- [+] button: "Create new" or "Import skill"

### Skill Detail (Right Panel)

```
┌────────────────────────────────────┐
│ humanizer                         │
│ [ON ●━━━━━━━━━━━━━━━━━○ OFF]  ⋯  │
│                                    │
│ Added by: You                      │
│ Last updated: 2 days ago           │
│ Invoked by: User and AI           │
│                                    │
│ Description:                       │
│ ℹ Rewrites AI-generated text      │
│   to sound more natural and       │
│   human-like. Triggered when      │
│   user asks to "humanize"...      │
│                                    │
│ [👁 Preview]  [</> Source]         │
│ ┌──────────────────────────────┐  │
│ │ ---                          │  │
│ │ name: humanizer              │  │
│ │ description: Rewrites AI...  │  │
│ │ ---                          │  │
│ │                              │  │
│ │ # Humanizer Skill            │  │
│ │ When the user asks to...     │  │
│ └──────────────────────────────┘  │
│                                    │
│ Allowed tools:                     │
│ Read, Write, Edit, Grep, Glob     │
│                                    │
│ Files:                             │
│ 📄 SKILL.md                       │
│ 📄 README.md                      │
│ 📁 reference/                     │
└────────────────────────────────────┘
```

### Skill Properties

| Property       | Description                                               |
| -------------- | --------------------------------------------------------- |
| Name           | Skill identifier                                          |
| Toggle         | ON/OFF — enables/disables the skill                       |
| Added by       | "You" or "AGI Workforce" (built-in)                       |
| Last updated   | Relative timestamp                                        |
| Invoked by     | "User only", "AI only", or "User and AI"                  |
| Description    | Trigger description with ℹ icon                           |
| Preview/Source | Toggle between rendered preview and raw markdown          |
| Allowed tools  | Which tools the skill can access                          |
| Files          | Multi-file support: SKILL.md + additional files + folders |

---

## 17. Connector Marketplace

### Access

- From Customize hub > Connectors tab > "Add connector"
- From + menu > Connectors > "Manage connectors"
- From Settings > Connectors > "Browse"

### Layout: Modal with Grid

```
┌──────────────────────────────────────────────────────────┐
│ Connectors                                          ✕    │
│ Connect your apps, files, and services.                  │
│ Connectors are reviewed for safety.                      │
│                                                          │
│ [🔍 Search]  [Sort v]  [Category v]                      │
│ [All] [Connected] [Available]                            │
├──────────────────┬──────────────────┬────────────────────┤
│ 📧 Gmail          │ 📁 Google Drive  │ 🐙 GitHub         │
│ #1 Most popular   │ ✓ Connected      │ Connect            │
│ Email management  │ File access      │ Repository access  │
├──────────────────┼──────────────────┼────────────────────┤
│ 💬 Slack          │ 📝 Notion        │ 📋 Linear         │
│ #7 popular        │ #5 popular       │ Connect            │
│ Team messaging    │ Workspace        │ Issue tracking     │
├──────────────────┼──────────────────┼────────────────────┤
│ 🎨 Figma          │ ▲ Vercel         │ 📅 Calendar       │
│ #6 popular        │ ✓ Connected      │ Connect            │
│ Design files      │ Deployments      │ Schedule mgmt      │
├──────────────────┴──────────────────┴────────────────────┤
│ + Add custom connector                                   │
└──────────────────────────────────────────────────────────┘
```

### Card Elements

- **Icon**: Connector brand icon
- **Name**: Connector name
- **Popularity badge**: "#N popular" or "Most popular"
- **Status**: "Connected" (green) or "Connect" (button)
- **Description**: One-line description

### Category Filters

Code, Communication, Data, Design, Development, Financial, Health, Productivity, Sales & Marketing

### Custom Connector Modal

```
┌──────────────────────────────────────────────────────────┐
│ Add custom connector                          BETA    ✕  │
│ Connect to your data and tools via MCP server.           │
│                                                          │
│ Name:                                                    │
│ ┌──────────────────────────────────────────────────────┐ │
│ │                                                      │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ Remote MCP server URL:                                   │
│ ┌──────────────────────────────────────────────────────┐ │
│ │                                                      │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ▶ Advanced settings                                      │
│                                                          │
│ ⚠ Only use connectors from developers you trust.        │
│                                                          │
│                              [Cancel]  [Add]             │
└──────────────────────────────────────────────────────────┘
```

### Connector Detail (in Customize Hub)

```
┌────────────────────────────────────┐
│ 📧 Gmail                          │
│ [Disconnect]  [⋯]                 │
│                                    │
│ Draft replies, summarize threads,  │
│ and search your inbox.            │
│                                    │
│ Tool Permissions:                  │
│                                    │
│ Read-only (6)           [Auto v]  │
│  ● Get Gmail Profile              │
│  ● List Gmail Drafts              │
│  ● List Gmail Labels              │
│  ● Read Gmail Email               │
│  ● Read Gmail Thread              │
│  ● Search Gmail Emails            │
│                                    │
│ Write/delete (1)        [Ask v]   │
│  ○ Create Gmail Draft             │
│                                    │
│ Per-tool icons:                    │
│ ● Auto  ✋ Ask  ⊘ Blocked         │
└────────────────────────────────────┘
```

### Permission Tiers

| Tier               | Default | Description                          |
| ------------------ | ------- | ------------------------------------ |
| Read-only tools    | Auto    | Execute without asking               |
| Write/delete tools | Ask     | Prompt user before executing         |
| Other tools        | Ask     | Prompt user for non-standard actions |

Each individual tool can be overridden: Auto, Ask, or Blocked.

---

## 18. Settings

### Access

- User profile popover > Settings
- Cmd+K > Settings
- Keyboard shortcut: ⌘,

### Layout: Modal Overlay

```
┌──────────────────────────────────────────────────────────┐
│ Settings                                            ✕    │
├───────────────┬──────────────────────────────────────────┤
│               │                                          │
│ General       │  (Content for selected tab)              │
│ Account       │                                          │
│ Privacy       │                                          │
│ Billing       │                                          │
│ Usage         │                                          │
│ Capabilities  │                                          │
│ Connectors    │                                          │
│ Models & Keys │                                          │
│ Voice         │                                          │
│ Agents        │                                          │
│               │                                          │
└───────────────┴──────────────────────────────────────────┘
```

### Tab Details

#### 1. General

- **Profile**: Avatar, Full name, Nickname ("What should AI call you?"), Work type dropdown, Personal preferences text area
- **Notifications**: Completions toggle, Agent updates toggle, Research complete toggle
- **Language**: English (US), Français, Deutsch, हिन्दी, 日本語, 한국어, Español, Português, Italiano, Indonesia
- **Appearance**: Dark / Light / System (3 radio buttons with visual previews)

#### 2. Account

- Email (display), Active sessions table (device, location, created, last active)
- Log out, Delete account (red, destructive)

#### 3. Privacy

- Export data (button)
- Shared chats (Manage button)
- Memory preferences (Manage link)
- Location metadata toggle (OFF by default) — "Allow coarse location"
- Help improve AI toggle (OFF by default) — "Allow training on your data"

#### 4. Billing

- Current plan + plan badge
- Payment method (Manage via Stripe)
- Extra usage balance + Buy more
- Auto-reload toggle
- Invoices list
- Cancel plan (red button)

#### 5. Usage

- Session progress bar (% used, resets in X hours)
- Weekly limits: All models %, per-model %
- Extra usage: $X spent, monthly limit, reset date
- Cost per conversation (if BYOK)

#### 6. Capabilities

- **Memory**: Search chats toggle (ON), Generate from history toggle (ON), Memory preview card, **Import memory from other AI providers** (Start import button)
- **Tool access mode**: Radio — "Load tools when needed" (default) / "Tools already loaded"
- **Visuals**: Artifacts toggle (ON), Inline visualizations toggle (ON)
- **Code execution**: Toggle (ON), Network egress toggle, Domain allowlist dropdown

#### 7. Connectors

- Connected connectors list with status
- "Browse connectors" button → Opens marketplace modal
- "Add custom connector" button
- Per-connector settings inline

#### 8. Models & Keys (OUR UNIQUE TAB)

- **API Keys**: Per-provider key management
  - Anthropic: [••••••••] [Edit] [Test] [Remove]
  - OpenAI: [Add key]
  - Google: [Add key]
  - Mistral: [Add key]
  - etc.
- **Default model**: Dropdown to set preferred model
- **Local models**: Ollama endpoint URL, LM Studio endpoint URL, "Test connection" button
- **Model routing**: Auto-router preferences (cost vs quality slider)

#### 9. Voice

- Voice input: STT provider (Whisper, Deepgram), Language, Sensitivity
- Voice output: TTS provider, Voice selection dropdown + Play preview
- Push-to-talk shortcut configuration
- Wake word toggle

#### 10. Agents

- **Auto-approve mode**: Ask (always prompt) / Smart (auto-approve low risk) / Full (auto-approve all)
- **Risk thresholds**: What counts as low/medium/high risk
- **Agent execution limits**: Max steps, timeout, cost cap
- **Approval UI**: Inline vs modal preference

---

## 19. Command Palette

### Access

- Keyboard: ⌘K (Mac) / Ctrl+K (Windows)
- Cmd+K in sidebar (not a nav item)

### Layout: Minimal

```
┌──────────────────────────────────────────────────────────┐
│ 🔍 Type a command...                                     │
├──────────────────────────────────────────────────────────┤
│ + New chat                                       ⇧⌘O    │
│ ⚙ Settings                                      ⌘,     │
│ 🔍 Search conversations                          ⌘F     │
│ 🌙 Toggle dark mode                              ⌘D     │
│ 💬 Go to Chats                                          │
│ 📁 Go to Projects                                       │
│ ⚡ Go to Skills                                          │
│ 🔌 Go to Connectors                                     │
└──────────────────────────────────────────────────────────┘
```

### Behavior

- Fuzzy search filters as user types
- Keyboard navigation: Arrow keys + Enter to select
- Escape to close
- Actions only — no feature launchers
- Results show keyboard shortcuts when available

---

## 20. User Profile

### Location

Bottom of sidebar — always visible.

### Expanded Sidebar

```
┌─────────────────────────┐
│ 👤 Siddhartha Nagula     │  ← Avatar (initials or image) + name
│    Pro plan              │  ← Plan badge
└─────────────────────────┘
```

### Collapsed Sidebar

```
┌──────┐
│  👤  │  ← Avatar only, tooltip shows name
└──────┘
```

### Click → Popover Menu

```
┌──────────────────────────────┐
│ siddharthanagula3@gmail.com  │  ← Email
├──────────────────────────────┤
│ ⚙ Settings             ⌘,  │
│ 🌐 Language >               │  ← Submenu with language list
│ ❓ Get help                  │
│ 📊 View all plans            │
│ 📱 Get apps                  │
│ ⌨ Keyboard shortcuts        │
├──────────────────────────────┤
│ 🚪 Log out                   │
└──────────────────────────────┘
```

---

## 21. Design Tokens

### Colors — Warm Dark Theme (Default)

```
/* Core */
--background:          #1a1915;    /* Warm olive-dark */
--foreground:          #e8e4db;    /* Warm off-white */

/* Surfaces */
--surface-base:        #1a1915;    /* Same as background */
--surface-elevated:    #242220;    /* Cards, inputs */
--surface-overlay:     #2e2b28;    /* Popovers, dropdowns */
--surface-hover:       #363330;    /* Hover states */

/* Text */
--text-primary:        #e8e4db;    /* Primary text */
--text-secondary:      #8b8680;    /* Secondary text */
--text-muted:          #5c5955;    /* Muted/disabled text */
--text-placeholder:    #6b6560;    /* Input placeholders */

/* Borders */
--border:              rgba(255, 235, 205, 0.08);   /* Subtle warm border */
--border-strong:       rgba(255, 235, 205, 0.15);   /* Emphasized border */

/* Brand / Accent */
--accent-primary:      #da7756;    /* Terra cotta — primary actions */
--accent-secondary:    #21808d;    /* Teal — secondary actions, links */

/* User message bubble */
--user-bubble-bg:      #2a2724;    /* Darker warm surface */

/* Thinking/Tool UI */
--thinking-text:       #8b8680;    /* Muted for reasoning text */
--thinking-line:       rgba(255, 235, 205, 0.08);   /* Vertical connector */

/* Badges */
--badge-result:        #22c55e;    /* Green — [Result] badge */
--badge-script:        #6b6560;    /* Gray — [Script] badge */
--badge-file:          #6b6560;    /* Gray — [filename] badge */

/* Agent Status */
--agent-thinking:      #a855f7;    /* Purple */
--agent-active:        #3b82f6;    /* Blue */
--agent-success:       #10b981;    /* Green */
--agent-error:         #ef4444;    /* Red */
--agent-warning:       #f59e0b;    /* Amber */

/* Semantic */
--destructive:         #ef4444;    /* Red — delete, cancel */
--info:                #3b82f6;    /* Blue — informational */
--success:             #22c55e;    /* Green — success */
--warning:             #f59e0b;    /* Amber — warning */
```

### Colors — Warm Light Theme

```
/* Core */
--background:          #faf9f7;    /* Warm cream */
--foreground:          #1a1915;    /* Warm dark text */

/* Surfaces */
--surface-base:        #faf9f7;
--surface-elevated:    #ffffff;
--surface-overlay:     #ffffff;
--surface-hover:       #f0eeeb;

/* Text */
--text-primary:        #1a1915;
--text-secondary:      #6b6560;
--text-muted:          #8b8680;

/* Borders */
--border:              rgba(26, 25, 21, 0.08);
--border-strong:       rgba(26, 25, 21, 0.15);

/* User message bubble */
--user-bubble-bg:      #f0eeeb;

/* Accents remain the same */
--accent-primary:      #da7756;
--accent-secondary:    #21808d;
```

### Spacing Scale

```
--space-1:   4px;     /* Tight */
--space-2:   8px;     /* Compact */
--space-3:   12px;    /* Default */
--space-4:   16px;    /* Standard */
--space-5:   20px;    /* Comfortable */
--space-6:   24px;    /* Spacious */
--space-8:   32px;    /* Section gaps */
--space-10:  40px;    /* Large gaps */
--space-12:  48px;    /* Extra large */
```

### Border Radius

```
--radius-sm:   6px;    /* Small elements (badges, pills) */
--radius-md:   8px;    /* Default (buttons, inputs) */
--radius-lg:   12px;   /* Cards, panels */
--radius-xl:   16px;   /* Large cards, modals */
--radius-2xl:  24px;   /* Message bubbles, input bar */
--radius-full: 9999px; /* Circular elements (avatars) */
```

### Shadows

```
--shadow-sm:   0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md:   0 4px 6px rgba(0, 0, 0, 0.1);
--shadow-lg:   0 10px 15px rgba(0, 0, 0, 0.15);
--shadow-xl:   0 20px 25px rgba(0, 0, 0, 0.2);
```

---

## 22. Typography

### Font Stack

```css
/* Sans-serif (body text) */
font-family:
  -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
  'Helvetica Neue', sans-serif;

/* Monospace (code blocks) */
font-family: 'SF Mono', 'Cascadia Code', 'Consolas', 'Liberation Mono', 'Courier New', monospace;

/* Dyslexia-friendly (accessibility option) */
font-family: 'OpenDyslexic', sans-serif;
```

### Type Scale

| Element         | Size | Weight         | Line Height |
| --------------- | ---- | -------------- | ----------- |
| Greeting text   | 28px | 400 (regular)  | 1.3         |
| H1 in responses | 24px | 700 (bold)     | 1.3         |
| H2 in responses | 20px | 700            | 1.4         |
| H3 in responses | 16px | 600 (semibold) | 1.4         |
| Body text       | 15px | 400            | 1.6         |
| Code (inline)   | 14px | 400            | 1.5         |
| Code (block)    | 14px | 400            | 1.5         |
| Sidebar nav     | 14px | 500 (medium)   | 1.4         |
| Sidebar recents | 13px | 400            | 1.3         |
| Timestamps      | 12px | 400            | 1.3         |
| Badges/pills    | 11px | 500            | 1.2         |
| Disclaimer      | 12px | 400            | 1.4         |
| Thinking text   | 14px | 400            | 1.5         |

---

## 23. Themes

### Available Themes

| Theme              | Mode  | Background | Description                         |
| ------------------ | ----- | ---------- | ----------------------------------- |
| **Dusk** (default) | Dark  | #1a1915    | Warm olive-dark. Cozy, premium.     |
| **Dawn**           | Light | #faf9f7    | Warm cream. Clean, paper-like.      |
| **System**         | Auto  | Follows OS | Maps to Dusk (dark) or Dawn (light) |

### Theme Application

Themes are applied via CSS custom properties on `:root`:

```typescript
function applyTheme(theme: 'dusk' | 'dawn' | 'system'): void {
  const root = document.documentElement;
  const resolved =
    theme === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dusk'
        : 'dawn'
      : theme;

  root.setAttribute('data-theme', resolved);
  root.classList.toggle('dark', resolved === 'dusk');
}
```

### Theme Access Points

1. Settings > General > Appearance
2. User profile popover (quick toggle)
3. Cmd+K > "Toggle dark mode" (⌘D)

---

## 24. Animations & Transitions

### Sidebar Collapse/Expand

```css
.sidebar {
  transition: width 200ms ease-out;
}
.sidebar-label {
  transition: opacity 100ms ease-out;
}
/* Labels fade at 50% of width transition */
```

### Artifact Panel Open/Close

```css
.artifact-panel {
  transition:
    width 250ms ease-out,
    opacity 200ms ease-in;
}
/* Sidebar auto-collapses simultaneously */
```

### Message Appear

```css
@keyframes messageIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.message-enter {
  animation: messageIn 200ms ease-out;
}
```

### Thinking Spinner

```css
@keyframes spinnerPulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}
.thinking-spinner {
  animation: spinnerPulse 1.5s ease-in-out infinite;
}
```

### Streaming Cursor

```css
@keyframes cursorBlink {
  0%,
  50% {
    opacity: 1;
  }
  51%,
  100% {
    opacity: 0;
  }
}
.streaming-cursor {
  animation: cursorBlink 1s step-end infinite;
}
```

### Quick Chip Hover

```css
.quick-chip {
  transition:
    background-color 150ms ease,
    border-color 150ms ease;
}
```

### General Rules

- All transitions: 150-250ms, ease-out
- No jarring instant changes — everything animates
- Respect `prefers-reduced-motion` — disable animations when set
- Use `transform` and `opacity` for GPU-accelerated animations

---

## 25. Differentiators

UI elements that highlight what Claude/ChatGPT/Gemini DON'T have:

### BYOK Badge

When user is using their own API key for a provider:

```
[A] Opus 4.6 Extended v    BYOK
                           ↑ small muted badge
```

- Shows "BYOK" text next to model name in input bar
- Also visible in model selector dropdown
- Indicates cost savings and data ownership

### Local Model Badge

When using Ollama/LM Studio:

```
[🖥] Llama 3.3 v    🖥 Local
                     ↑ monitor icon + "Local" text
```

- Monitor icon (🖥) as provider icon
- "Local" badge in input bar and dropdown
- Indicates data never leaves device

### Mobile Companion Status

When mobile phone is paired via WebRTC:

```
┌──────────────────────────────────────────────────────────┐
│           SpaceX Analysis v                    📱 ⇡      │
└──────────────────────────────────────────────────────────┘
                                                  ↑ phone icon
                                                    (glows when agent executing)
```

- Small phone icon (📱) in conversation header
- Static when paired but idle
- Pulses/glows when agent is actively executing (mobile can see actions)
- Tooltip: "Mobile companion connected"

---

## 26. Mobile Alignment

The mobile app (Expo) should align with this redesign:

### Shared Patterns

| Pattern         | Desktop/Web           | Mobile                              |
| --------------- | --------------------- | ----------------------------------- |
| Model selector  | Dropdown in input bar | Bottom sheet with provider sections |
| + Menu          | Dropdown menu         | Bottom sheet                        |
| Thinking blocks | Collapsible inline    | Collapsible inline (same UI)        |
| Citations       | Inline pills          | Inline pills (same)                 |
| Quick chips     | Below input           | Below input (same)                  |
| Greeting        | Playful rotating      | Same variants                       |
| Action bar      | 4 icons               | 4 icons (same)                      |
| Disclaimer      | Bottom center         | Bottom center                       |

### Mobile-Specific Differences

| Element               | Mobile Adaptation                       |
| --------------------- | --------------------------------------- |
| Sidebar               | Slide-out drawer (swipe from left edge) |
| Artifact panel        | Full-screen overlay (no split view)     |
| Settings              | Full-page navigation (not modal)        |
| Customize hub         | Full-page navigation                    |
| Voice                 | Prominent mic button (mobile-first)     |
| Projects              | Full-page with back navigation          |
| Connector marketplace | Full-screen modal                       |

### Design Token Sharing

Mobile uses the same color tokens via NativeWind configuration:

- Same `--background`, `--foreground`, `--accent-*` values
- Same warm dark / warm light palette
- Same spacing scale and border radius

---

## 27. Shared Package Structure

### New Package: `packages/chat/`

```
packages/chat/
├── package.json              # @agiworkforce/chat
├── tsconfig.json
├── src/
│   ├── index.ts              # Public API exports
│   │
│   ├── components/
│   │   ├── ChatInterface.tsx  # Main orchestrator
│   │   ├── Sidebar.tsx        # 7-item sidebar
│   │   ├── EmptyState.tsx     # Greeting + chips
│   │   ├── ConversationHeader.tsx
│   │   ├── MessageList.tsx    # Message stream
│   │   ├── MessageBubble.tsx  # Single message
│   │   ├── ChatInput.tsx      # Input bar
│   │   ├── ModelSelector.tsx  # Multi-provider picker
│   │   ├── PlusMenu.tsx       # + button menu
│   │   ├── QuickChips.tsx     # Quick action chips
│   │   ├── ThinkingBlock.tsx  # Collapsible thinking
│   │   ├── ToolTimeline.tsx   # Tool call timeline
│   │   ├── ArtifactPanel.tsx  # Right panel
│   │   ├── ActionBar.tsx      # Copy, thumbs, retry
│   │   ├── CitationPill.tsx   # Inline citation
│   │   ├── WebSearchCard.tsx  # Search results card
│   │   ├── ImageGenCard.tsx   # Image generation inline
│   │   ├── VideoGenCard.tsx   # Video generation inline
│   │   ├── DownloadCard.tsx   # File download card
│   │   ├── ConversationItem.tsx  # Sidebar conversation row
│   │   ├── UserProfile.tsx    # Bottom profile + popover
│   │   ├── Disclaimer.tsx     # Context-aware disclaimer
│   │   └── ui/               # Shared UI primitives
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Dialog.tsx
│   │       ├── Popover.tsx
│   │       ├── DropdownMenu.tsx
│   │       ├── Badge.tsx
│   │       ├── Toggle.tsx
│   │       ├── ScrollArea.tsx
│   │       ├── ResizeHandle.tsx
│   │       └── Tooltip.tsx
│   │
│   ├── stores/
│   │   ├── chatStore.ts       # Conversations, messages, streaming
│   │   ├── modelStore.ts      # Model selection, providers
│   │   ├── uiStore.ts         # Sidebar, panels, theme
│   │   ├── projectStore.ts    # Projects, files, memory
│   │   └── settingsStore.ts   # User preferences
│   │
│   ├── hooks/
│   │   ├── useChat.ts         # Send, stream, retry
│   │   ├── useModel.ts        # Model switching
│   │   ├── useTheme.ts        # Theme access
│   │   ├── useSidebar.ts      # Sidebar state
│   │   ├── useArtifact.ts     # Artifact panel
│   │   └── useKeyboard.ts     # Keyboard shortcuts
│   │
│   ├── lib/
│   │   ├── tokens.ts          # Design tokens (colors, spacing)
│   │   ├── runtime.ts         # ChatRuntime interface
│   │   ├── utils.ts           # cn(), formatters
│   │   ├── greetings.ts       # Time-aware greeting variants
│   │   └── types.ts           # Shared interfaces
│   │
│   └── styles/
│       ├── globals.css        # CSS custom properties + base styles
│       └── themes/
│           ├── dusk.css       # Warm dark theme
│           └── dawn.css       # Warm light theme
```

### Dependency Graph

```
packages/chat/
  ├── depends on: packages/types, packages/utils
  ├── peer deps: react, react-dom, zustand, @radix-ui/*
  └── consumed by: apps/desktop, apps/web

apps/desktop/
  ├── imports: @agiworkforce/chat
  ├── provides: TauriRuntime (invoke, events, window controls)
  └── adds: TitleBar, system tray, native features

apps/web/
  ├── imports: @agiworkforce/chat
  ├── provides: WebRuntime (fetch, SSE, Supabase auth)
  └── adds: Auth pages, landing pages, API routes
```

---

## 28. Migration Plan

### Phase 1: Foundation (packages/chat)

1. Create `packages/chat/` package with tsconfig, package.json
2. Extract design tokens into `lib/tokens.ts` (warm dark + warm light)
3. Move shared UI primitives (Button, Input, Dialog, etc.) from desktop
4. Create `ChatRuntime` interface and platform adapters
5. Build `ChatInterface.tsx` orchestrator with 2-panel layout

### Phase 2: Core Chat Components

6. Build `Sidebar.tsx` with 7 nav items + collapse animation
7. Build `EmptyState.tsx` with rotating greetings + quick chips
8. Build `ChatInput.tsx` with + menu (7 items) + model selector
9. Build `ModelSelector.tsx` with provider icons + tier grouping
10. Build `MessageList.tsx` + `MessageBubble.tsx` with action bar

### Phase 3: Advanced Features

11. Build `ThinkingBlock.tsx` with Claude-style collapsible timeline
12. Build `CitationPill.tsx` + `WebSearchCard.tsx`
13. Build `ArtifactPanel.tsx` with preview/code toggle
14. Build `ImageGenCard.tsx` + `VideoGenCard.tsx` inline
15. Build `DownloadCard.tsx` for file artifacts

### Phase 4: Hub & Settings

16. Build Customize hub (3-panel, Skills/Connectors tabs)
17. Build Settings modal (10 tabs)
18. Build Connector marketplace modal
19. Build Project detail page with right sidebar
20. Build Command palette (Cmd+K)

### Phase 5: Integration

21. Wire desktop app to import from `packages/chat/`
22. Wire web app `/chat` route to import from `packages/chat/`
23. Apply warm dark + warm light themes
24. End-to-end testing on both platforms
25. Remove deprecated components from desktop

### Phase 6: Polish

26. Animations and transitions
27. Keyboard shortcuts
28. Accessibility audit (WCAG 2.1 AA)
29. Performance optimization (lazy loading, memoization)
30. Cross-browser testing

---

## Appendix A: Keyboard Shortcuts

| Shortcut | Action                 |
| -------- | ---------------------- |
| ⌘K       | Command palette        |
| ⇧⌘O      | New chat               |
| ⌘,       | Settings               |
| ⌘F       | Search conversations   |
| ⌘D       | Toggle dark/light mode |
| ⌘[       | Collapse sidebar       |
| ⌘]       | Expand sidebar         |
| Escape   | Close panel/modal/menu |
| ⌘Enter   | Send message           |
| ⇧Enter   | New line in input      |

---

## Appendix B: Removed from UI

The following items are **removed entirely** from the sidebar and main UI. They are either accessible via Cmd+K, chat commands, or are deferred to future releases:

- Terminal, Canvas, MCP Tools browser, Images gallery, Schedules, Git panel, Research panel, Database panel, Workflows, Documents, Calendar, Artifacts gallery, Tasks panel, Vision panel, Computer Use panel, Automation, Analytics, ROI Dashboard, Memory panel, Teams, Cloud storage, Marketplace, Governance, Action Recorder, Messaging, Productivity tools
- "More" popover with 20+ items
- All 28+ previous sidebar nav items
- Status bar (tokens, provider, AGI status) — deferred
- Sidecar panels (Terminal, Browser, etc.) — available via chat/Cmd+K

---

## Appendix C: Decision Log

All decisions made during the March 22, 2026 design review session:

| #   | Decision          | Choice                                    | Rationale                                              |
| --- | ----------------- | ----------------------------------------- | ------------------------------------------------------ |
| 1   | Codebase sharing  | Shared packages/chat/                     | Single source of truth, no drift                       |
| 2   | Default layout    | 2-panel + on-demand right                 | Everything inline principle                            |
| 3   | Sidebar items     | 7 items                                   | Skills + Connectors both visible as differentiators    |
| 4   | Color scheme      | Warm dark (#1a1915)                       | Cozy, premium, matches product spec                    |
| 5   | Model selector    | Provider + Model, tiered                  | Multi-provider is key differentiator                   |
| 6   | + Menu            | 7 items (simplified)                      | Files, Skills, Connectors, Research, Web, Image, Video |
| 7   | Quick chips       | 5 (Code, Write, Research, Skills, Web)    | Covers top use cases                                   |
| 8   | Empty state       | Playful rotating greetings                | Personality, warmth                                    |
| 9   | Settings          | Modal overlay, 10 tabs                    | More granular than Claude's 8                          |
| 10  | Customize hub     | 3-panel replacing chat                    | Matches Claude, full browsing experience               |
| 11  | Cmd+K             | Minimal (actions only)                    | No feature launchers, keep it simple                   |
| 12  | Artifact triggers | All 4 (code, docs, research, explicit)    | Maximum flexibility                                    |
| 13  | Thinking UI       | Claude-style inline                       | Inline, not side panel                                 |
| 14  | Follow-ups        | None                                      | Clean responses, no noise                              |
| 15  | Citations         | Small inline pills                        | Subtle, doesn't break reading flow                     |
| 16  | Projects          | Right sidebar (Memory/Instructions/Files) | Matches Claude                                         |
| 17  | Font              | System font stack                         | 0ms load, native feel                                  |
| 18  | Differentiators   | BYOK + Local + Mobile companion badges    | Not cost tracker                                       |
| 19  | Web chat          | Embedded in Next.js                       | Same domain, proper auth, no redirect                  |
| 20  | Image/Video gen   | Separate + menu items                     | Clear, discoverable                                    |
| 21  | Header            | Minimal (title + share)                   | Clean, matches Claude                                  |
| 22  | Theme             | Dark + Light + System                     | Full theme support at launch                           |
| 23  | Marketplace       | Modal with grid                           | Search, sort, categories                               |
| 24  | Voice             | Mic icon right of input                   | Standard placement                                     |
| 25  | Action bar        | 4 icons                                   | Copy, thumbs up/down, retry                            |
| 26  | Sidebar animation | Smooth 200ms transition                   | Labels fade, chat expands                              |
| 27  | Disclaimer        | Context-aware                             | Changes for citations/code                             |
| 28  | Settings tabs     | 10 tabs                                   | Models & Keys is our unique tab                        |

---

_This document is the authoritative specification for the AGI Workforce UI redesign. All implementation should reference this document. When ambiguous, follow Claude.ai's pattern._
