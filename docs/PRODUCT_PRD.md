# AGI Workforce — Product Requirements Document

> **Format**: Component-first with ASCII wireframes, design tokens, props, states, behavior
> **Design reference**: Cherry-pick best — Claude (thinking/tools), ChatGPT (personalization), Perplexity (search/citations)
> **Scope**: Desktop + Mobile + Web + Extension
> **Last updated**: March 21, 2026

---

## 1. DESIGN PRINCIPLES

1. **Everything inline** — images, videos, tool results, search results, thinking blocks, tables. NO side panels unless explicitly requested.
2. **Collapsible everything** — thinking, tool results, search results. One-line summary when collapsed.
3. **5 sidebar items, not 28** — New Chat, Search, Customize, Chats, Projects. Everything else via Cmd+K.
4. **Multi-model is the differentiator** — model selector always visible, provider shown.
5. **BYOK is the moat** — show "Your API key" indicators, cost tracking.
6. **Privacy-first** — incognito mode, local LLM indicators, data sovereignty messaging.

---

## 2. DESIGN SYSTEM

### 2.1 Color Tokens (Dark Theme — Primary)

```
--bg-primary:        #1a1915    // warm dark olive (match Claude.ai)
--bg-secondary:      #242220    // card/input background
--bg-tertiary:       #2d2b28    // hover states
--bg-input:          #2a2825    // input bar background
--bg-user-msg:       #302e2a    // user message bubble
--bg-thinking:       #1e2530    // thinking block (slate tint)
--text-primary:      #e8e4db    // off-white
--text-secondary:    #8b8680    // muted gray
--text-link:         #6b9eff    // blue links
--accent-brand:      #e87040    // warm brand accent (asterisk color)
--accent-blue:       #4a90d9    // active feature badges
--accent-green:      #34a853    // connected/success
--accent-red:        #ea4335    // error/disconnect
--accent-amber:      #f9ab00    // thinking/warning
--accent-purple:     #9b59b6    // incognito
--border-subtle:     #3a3835    // subtle borders
--border-input:      #4a4744    // input border
```

### 2.2 Typography

```
--font-sans:         system-ui, -apple-system, sans-serif
--font-mono:         'SF Mono', 'Fira Code', monospace
--text-xs:           12px / 1.4
--text-sm:           14px / 1.5
--text-base:         15px / 1.6    // response body text
--text-lg:           18px / 1.5    // section headers in responses
--text-xl:           24px / 1.3    // greeting text
--text-2xl:          32px / 1.2    // hero greeting
--font-weight-normal: 400
--font-weight-medium: 500
--font-weight-bold:   600
```

### 2.3 Spacing

```
--space-1:  4px     --space-2:  8px     --space-3:  12px
--space-4:  16px    --space-5:  20px    --space-6:  24px
--space-8:  32px    --space-10: 40px    --space-12: 48px
--radius-sm:  6px   --radius-md:  8px   --radius-lg: 12px
--radius-xl: 16px   --radius-full: 9999px
```

### 2.4 Shadows & Effects

```
--shadow-sm:   0 1px 2px rgba(0,0,0,0.3)
--shadow-md:   0 4px 12px rgba(0,0,0,0.4)
--shadow-lg:   0 8px 24px rgba(0,0,0,0.5)
--blur-glass:  blur(12px)
```

---

## 3. COMPONENTS

---

### 3.1 Sidebar

#### Wireframe

```
┌─────────────────────┐  ┌──────┐
│ ✦ AGI Workforce  [⊟]│  │ [⊟] │
│                      │  │ [+]  │
│ [+] New chat    ⇧⌘O │  │ [🔍] │
│ [🔍] Search          │  │ [💼] │
│ [💼] Customize       │  │ [💬] │
│ [💬] Chats           │  │ [📁] │
│ [📁] Projects        │  │      │
│                      │  │      │
│ ─── Recents ──────── │  │ ...  │
│ Dark theme neon ca...│  │      │
│ AGI Workforce bus... │  │      │
│ Latest SpaceX Sta... │  │      │
│ Top AI desktop ap... │  │      │
│ ...                  │  │      │
│                      │  │      │
│ ┌──────────────────┐ │  │ [SN] │
│ │ [SN] Siddhartha  │ │  └──────┘
│ │ Max plan    ⬇ ↕  │ │  collapsed
│ └──────────────────┘ │
└─────────────────────┘
      expanded (260px)
```

#### Props

| Prop                 | Type           | Description                                  |
| -------------------- | -------------- | -------------------------------------------- |
| isCollapsed          | boolean        | Sidebar expanded (260px) or collapsed (48px) |
| conversations        | Conversation[] | Recent conversation list                     |
| activeConversationId | string         | Currently selected conversation              |
| user                 | UserProfile    | Name, plan, avatar                           |

#### States

- `expanded` — full nav labels + recents list + user profile
- `collapsed` — icon-only, tooltips on hover
- `transitioning` — smooth width animation (260px ↔ 48px, 200ms ease)

#### Behavior

- **Toggle**: Click ⊟ icon (top-right) or Cmd+B
- **New chat**: Click + or Shift+Cmd+O
- **Search**: Opens search overlay
- **Customize**: Navigates to /customize (Skills + Connectors)
- **Conversation click**: Loads conversation, highlights in list
- **Conversation hover**: Shows ··· menu (rename, pin, archive, delete, export)
- **User profile click**: Opens popover (email, settings, language, help, logout)
- **Auto-collapse**: When artifact panel opens, sidebar collapses to icons

#### Design Tokens

```
--sidebar-width-expanded:  260px
--sidebar-width-collapsed: 48px
--sidebar-bg:              var(--bg-primary)
--sidebar-border:          1px solid var(--border-subtle)
--sidebar-item-height:     36px
--sidebar-item-radius:     var(--radius-md)
--sidebar-item-hover:      var(--bg-tertiary)
--sidebar-item-active:     var(--bg-secondary)
--sidebar-recents-label:   var(--text-secondary), var(--text-xs)
```

---

### 3.2 InputBar

#### Wireframe

```
┌──────────────────────────────────────────────────┐
│ How can I help you today?                        │
│ (or "Reply..." in conversation)                  │
│ (or "Type / for skills")                         │
│                                                  │
│ [+] [🔍] [✏️]        [Model v] [Extended] [🎤]  │
│     ↑ active feature badges (blue)               │
└──────────────────────────────────────────────────┘
      └─ PlusMenu    └─ ModelSelector  └─ VoiceBtn
```

#### Props

| Prop           | Type        | Description                                      |
| -------------- | ----------- | ------------------------------------------------ |
| placeholder    | string      | Context-aware placeholder text                   |
| activeFeatures | Feature[]   | Currently active features (Research, Web, Style) |
| model          | ModelConfig | Current model + provider                         |
| isStreaming    | boolean     | AI is responding                                 |
| attachments    | File[]      | Uploaded files                                   |
| focusMode      | FocusMode   | null / "web" / "code" / "write" / "research"     |

#### States

- `empty` — placeholder visible, no active features
- `typing` — user is typing, send button appears
- `has-attachments` — attachment preview strip above input
- `streaming` — stop button replaces voice, input shows "Reply..."
- `slash-command` — "/" typed, skill autocomplete dropdown visible
- `error` — red border, error message below

#### Behavior

- **+ button**: Opens PlusMenu dropdown
- **Active feature badges**: Blue rounded-square icons appear next to + when features enabled. Click to deactivate.
- **Model selector**: Shows current "Provider Model [Extended]" — click opens QuickModelSelector
- **Voice button**: Tap to record, hold for voice mode
- **Send**: Enter to send, Shift+Enter for newline
- **Slash commands**: Type "/" to trigger skill autocomplete list
- **Stop**: During streaming, voice icon becomes stop icon
- **Auto-resize**: Textarea grows with content (max 200px height)

#### Design Tokens

```
--input-bg:           var(--bg-input)
--input-border:       1px solid var(--border-input)
--input-border-focus:  1px solid var(--accent-blue)
--input-radius:       var(--radius-xl)
--input-padding:      16px 16px 12px 16px
--input-min-height:   56px
--input-max-height:   200px
--input-font:         var(--text-base)
--input-placeholder:  var(--text-secondary)
--badge-size:         32px
--badge-radius:       var(--radius-md)
--badge-bg-active:    rgba(74, 144, 217, 0.15)
--badge-icon-active:  var(--accent-blue)
```

---

### 3.3 PlusMenu (+ Button Dropdown)

#### Wireframe

```
┌─────────────────────────┐
│ 📎 Add files or photos  │
│ 📷 Take a screenshot    │
│ 📁 Add to project     → │
│ 🔶 Add from Drive     → │
│ 🐙 Add from GitHub      │
│ ──────────────────────── │
│ 📋 Skills              → │  ┌──────────────────┐
│ 🔌 Connectors          → │  │ humanizer        │
│ ──────────────────────── │  │ brand-guidelines  │
│ 🔍 Research              │  │ mcp-builder      │
│ 🌐 Web search        ✓  │  │ ...              │
│ ✏️ Use style           → │  │ ⚙ Manage skills  │
└─────────────────────────┘  └──────────────────┘
```

#### Behavior (cherry-picked from Claude + ChatGPT + Perplexity)

- **Attachments section**: files, screenshot, project, Drive, GitHub
- **Features section**: Skills submenu (all skills + Manage), Connectors submenu (per-connector toggles + Manage + Tool access), Research trigger, Web search toggle (green ✓ when on), Use style submenu
- **Connectors submenu**: Each connector has on/off toggle for current conversation (from Claude). Also source filters (Web, Academic, Social — from Perplexity)
- **Skills submenu**: List all skills + "Manage skills" link at bottom

---

### 3.4 ModelSelector

#### Wireframe

```
┌───────────────────────────────┐
│ Opus 4.6                      │
│ Most capable for ambitious... │
│                               │
│ Sonnet 4.6               ✓   │
│ Most efficient for everyday.. │
│                               │
│ Haiku 4.5                     │
│ Fastest for quick answers     │
│ ─────────────────────────── │
│ Extended thinking        [🔵] │
│ Think longer for complex...   │
│ ─────────────────────────── │
│ More models              →   │
│   └→ Opus 4.5, GPT-4o, etc. │
│ ─────────────────────────── │
│ ⚡ Local Models           →   │  ← OUR DIFFERENTIATOR
│   └→ Ollama, LM Studio      │
└───────────────────────────────┘
```

#### Display Format in InputBar

```
[Anthropic] Sonnet 4.6 Extended v    ← provider + model + mode
[OpenAI] GPT-4o v                    ← multi-provider
[Local] Llama 3 v                    ← local LLM indicator
```

#### Props

| Prop             | Type        | Description                  |
| ---------------- | ----------- | ---------------------------- |
| currentModel     | ModelConfig | Selected model with provider |
| extendedThinking | boolean     | Thinking mode enabled        |
| availableModels  | Model[]     | All configured models        |
| localModels      | Model[]     | Ollama/LM Studio models      |
| favorites        | Model[]     | User's favorite models       |

#### Design Tokens

```
--model-selector-width:  280px
--model-item-height:     56px
--model-check-color:     var(--accent-green)
--thinking-toggle-color: var(--accent-blue)
--local-badge-color:     var(--accent-green)  // "Local" badge
--byok-badge-color:      var(--accent-amber)  // "Your key" badge
```

---

### 3.5 EmptyState (New Chat)

#### Wireframe

```
┌──────────────────────────────────────────────────┐
│                                                  │
│                                                  │
│         ✦ Good evening, Siddhartha               │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ How can I help you today?                │    │
│  │                                          │    │
│  │ [+]              [Sonnet 4.6 Extended v] │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  [</> Code] [✏ Write] [🎓 Learn] [🔶 Drive] [📧 Gmail] │
│                                                  │
└──────────────────────────────────────────────────┘
```

#### Behavior

- **Greeting**: Personalized with user's name + time-of-day text + brand icon
- **Quick chips**: 5 contextual chips below input. Last 2 are connector-powered (only show if connected)
- **Chips disappear** once user starts typing or conversation begins
- **Focus modes**: Code/Write/Learn change the input placeholder and system prompt
- **Chip click**: Sets focus mode + updates placeholder

#### Design Tokens

```
--greeting-font:     var(--text-2xl), var(--font-weight-medium)
--greeting-icon:     32px, var(--accent-brand)
--chip-bg:           var(--bg-secondary)
--chip-border:       1px solid var(--border-subtle)
--chip-radius:       var(--radius-full)
--chip-padding:      8px 16px
--chip-font:         var(--text-sm)
--chip-hover:        var(--bg-tertiary)
```

---

### 3.6 ThinkingBlock

#### Wireframe

```
Collapsed:
┌──────────────────────────────────────────────────┐
│ Architected interactive calculator with dark...  >│
└──────────────────────────────────────────────────┘

Expanded:
┌──────────────────────────────────────────────────┐
│ Architected interactive calculator with dark...  v│
│                                                  │
│ │ ⏱ The user wants an interactive HTML calc...   │
│ │                                                │
│ │ 📄 Read frontend design skill for best...      │
│ │                                                │
│ │ ⏱ Let me create a stunning neon calculator...  │
│ │                                                │
│ │ 📝 Creating interactive neon calculator...     │
│ │    ┌─────────────────────┐                     │
│ │    │ neon-calculator.html │  ← file badge      │
│ │    └─────────────────────┘                     │
│ │                                                │
│ │ ⏱ Done. Let me present the file.              │
│ │                                                │
│ │ 📄 Presented file                              │
│ │                                                │
│ │ ✅ Done                                        │
└──────────────────────────────────────────────────┘
  ↑ vertical line connecting all steps
```

#### Icon Vocabulary (from Claude.ai)

| Icon                 | Meaning                               | Color                 |
| -------------------- | ------------------------------------- | --------------------- |
| ✳ asterisk (spinner) | AI is thinking (in-progress)          | var(--accent-brand)   |
| ⏱ clock              | Thinking/reasoning text between steps | var(--text-secondary) |
| 📄 document          | Reading a file/skill                  | var(--text-secondary) |
| 📦 terminal          | Running a script/command              | var(--text-secondary) |
| 📝 code/edit         | Creating/writing a file               | var(--text-secondary) |
| 🌐 globe             | Web search                            | var(--text-secondary) |
| 🔗 link              | MCP tool call                         | var(--text-secondary) |
| ✅ checkmark         | Step completed / "Done"               | var(--accent-green)   |

#### Badge Types

| Badge       | Style                                 | Meaning                   |
| ----------- | ------------------------------------- | ------------------------- |
| "Script"    | small gray pill                       | A script was executed     |
| "Result"    | small green pill                      | Tool result (collapsible) |
| file name   | small gray pill (e.g., "proposal.js") | File created/read         |
| "N results" | right-aligned count                   | Search result count       |

#### Props

| Prop        | Type           | Description                        |
| ----------- | -------------- | ---------------------------------- |
| summary     | string         | Auto-generated one-line summary    |
| steps       | ThinkingStep[] | Sequential steps with icons + text |
| isStreaming | boolean        | Still receiving thinking content   |
| isExpanded  | boolean        | User-toggled expand state          |

#### States

- `streaming` — spinner icon, expanding content, auto-expanded
- `collapsed` — one-line summary + > chevron
- `expanded` — full timeline with vertical line + all steps
- `auto-collapse` — collapses when streaming ends (unless user manually expanded)

#### Design Tokens

```
--thinking-bg:          transparent
--thinking-summary-font: var(--text-sm), var(--text-secondary)
--thinking-step-font:   var(--text-sm), var(--text-secondary), italic
--thinking-icon-size:   16px
--thinking-line-color:  var(--border-subtle)
--thinking-line-width:  2px
--thinking-badge-bg:    var(--bg-tertiary)
--thinking-badge-font:  var(--text-xs)
--thinking-badge-radius: var(--radius-sm)
--thinking-chevron-size: 12px
```

---

### 3.7 WebSearchCard

#### Wireframe

```
┌──────────────────────────────────────────────────┐
│ 🌐 SpaceX Starship news today 2026    10 results │
│ ┌──────────────────────────────────────────────┐ │
│ │ 🔴 SpaceX laying Starship foundations...     │ │
│ │    nasaspaceflight.com                       │ │
│ │ 🔴 Starship V3 test fire at Pad 2...        │ │
│ │    space.com                                 │ │
│ │ 🔴 NASA's Artemis delays mount...           │ │
│ │    reuters.com                               │ │
│ │ +7 more                                      │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

#### Behavior

- Globe icon + search query text + result count badge (right-aligned)
- Expandable results card: rows of favicon + title + domain
- Multiple searches stack vertically inside thinking block
- Collapses with thinking block when done

---

### 3.8 InlineCitations

#### Wireframe

```
...fired 10 of its engines. [Space.com] This was a triple
first — the first major test... [Gizmodo] However, SpaceX
noted the test ended early. [Space.com]
```

#### Design Tokens

```
--citation-bg:         rgba(255,255,255,0.08)
--citation-font:       var(--text-xs), var(--font-weight-medium)
--citation-radius:     var(--radius-sm)
--citation-padding:    2px 6px
--citation-hover:      rgba(255,255,255,0.15)
--citation-cursor:     pointer  // opens source URL
```

---

### 3.9 DownloadCard

#### Wireframe

```
┌──────────────────────────────────────────────────┐
│ [</>]  Neon calculator              [Download]   │
│        Code · HTML                               │
└──────────────────────────────────────────────────┘
```

#### Variants

| Type         | Icon | Label               |
| ------------ | ---- | ------------------- |
| HTML/Code    | </>  | Code · HTML         |
| Document     | 📄   | Document · DOCX     |
| Spreadsheet  | 📊   | Spreadsheet · XLSX  |
| Presentation | 📊   | Presentation · PPTX |
| PDF          | 📄   | Document · PDF      |

---

### 3.10 ActionBar (Response Actions)

#### Wireframe

```
[📋] [👍] [👎] [🔄]                        [↗ Share]
 copy  up   down retry                      (top-right)
```

#### Behavior (cherry-pick: Claude 4 icons + Perplexity source count)

- **Copy**: Copy response as markdown
- **Thumbs up/down**: Feedback
- **Retry**: Regenerate response
- **Share**: Top-right corner, appears after first response
- **Source count** (when citations present): Favicon icons + "N sources" text between action icons

---

### 3.11 FollowUpSuggestions (from Perplexity)

#### Wireframe

```
Follow-ups
┌──────────────────────────────────────────────┐
│ ↩ Compare Claude Desktop vs ChatGPT for...  │
├──────────────────────────────────────────────┤
│ ↩ What are the pricing differences betw...   │
├──────────────────────────────────────────────┤
│ ↩ Build a sortable dashboard for...  [Agent] │
└──────────────────────────────────────────────┘
```

#### Behavior

- Appears below every response when web search or research was used
- 3-5 AI-generated follow-up questions
- Click = sends as next message
- Some may have [Agent] badge suggesting agent mode
- Disappears once user sends their own follow-up

---

### 3.12 IncognitoMode

#### Wireframe

```
┌ 🔒 Incognito chat ─────────────────────── [✕] ─┐
│ ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐ │
│ ╎                                              ╎ │
│ ╎        ✦ You're incognito                    ╎ │
│ ╎                                              ╎ │
│ ╎  ┌──────────────────────────────────────┐    ╎ │
│ ╎  │ How can I help you today?            │    ╎ │
│ ╎  │ [+]           [Sonnet 4.6 Extended v]│    ╎ │
│ ╎  └──────────────────────────────────────┘    ╎ │
│ ╎                                              ╎ │
│ ╎  Incognito chats aren't saved, added to      ╎ │
│ ╎  memory, or used to train models.            ╎ │
│ ╎  Learn more about how your data is used.     ╎ │
│ ╎                                              ╎ │
│ └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘ │
└─────────────────────────────────────────────────┘
  ↑ dashed border around entire chat area
```

#### Design Tokens

```
--incognito-border:    2px dashed var(--accent-purple)
--incognito-header-bg: var(--bg-secondary)
--incognito-icon:      var(--accent-purple)
--incognito-text:      var(--text-secondary)
```

---

### 3.13 ResearchCard

#### Wireframe

```
┌──────────────────────────────────────────────────┐
│ Trillionaire wealth-building research          > │
│ 🔴📧🌐 Research complete · 438 sources · 13m 8s │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ Research Report                          [📄]    │
│ Document                                 preview │
└──────────────────────────────────────────────────┘
```

---

### 3.14 ConnectorMarketplace

#### Wireframe

```
┌──────────────────────────────────────────────────┐
│ Connectors                                   [✕] │
│ Connect your apps. Built by third parties and    │
│ reviewed for safety. Add a custom connector.     │
│                                                  │
│ [Search...    ] [Sort v] [Type v] [Categories v] │
│                                                  │
│ ┌─────────────────┐ ┌─────────────────┐         │
│ │ 📧 Gmail        │ │ 📅 Calendar     │         │
│ │ Most popular  ✓ │ │ #2 popular    + │         │
│ └─────────────────┘ └─────────────────┘         │
│ ┌─────────────────┐ ┌─────────────────┐         │
│ │ 🎨 Canva        │ │ 📝 Notion       │         │
│ │ #4 popular    + │ │ #5 popular    + │         │
│ └─────────────────┘ └─────────────────┘         │
│ ...                                              │
└──────────────────────────────────────────────────┘

Categories: Code, Communication, Data, Design,
Development, Financial, Health, Life sciences,
Productivity, Sales & marketing

Types: Interactive (New), Desktop, Web
```

---

### 3.15 ArtifactPanel (Right Side)

#### Wireframe

```
┌──────────────────────────────────────────────────┐
│ [👁] [</>]  Neon calculator · HTML  [📋] [v] [↻] [✕] │
│ ─────────────────────────────────────────────── │
│ ┌──────────────────────────────────────────────┐│
│ │                                              ││
│ │        (Live interactive preview)            ││
│ │        Buttons work, JS executes             ││
│ │                                              ││
│ └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

- Opens right side, chat narrows, sidebar collapses
- Toggle: preview (eye) ↔ code (</>) view
- Code view: line numbers + syntax highlighting
- Only opens for artifacts — NOT for regular responses

---

### 3.16 Disclaimer

```
Claude is AI and can make mistakes. Please double-check responses.
(or when citations: "Please double-check cited sources.")
```

- Small, muted, centered at bottom
- Context-aware: changes text when sources are cited

---

## 4. SCREENS

---

### 4.1 Desktop — New Chat

```
┌──┬──────────────────────────────────────────────┬──┐
│  │                                              │  │
│S │                                              │  │
│I │         ✦ Good evening, Siddhartha           │  │
│D │                                              │  │
│E │  ┌──────────────────────────────────────┐    │  │
│B │  │ How can I help you today?            │    │  │
│A │  │ [+]           [Sonnet 4.6 Extended v]│    │  │
│R │  └──────────────────────────────────────┘    │  │
│  │  [Code] [Write] [Learn] [Drive] [Gmail]      │  │
│  │                                              │  │
│  │  Disclaimer text                             │  │
└──┴──────────────────────────────────────────────┴──┘
```

### 4.2 Desktop — Active Chat

```
┌──┬──────────────────────────────────────────────┬──┐
│  │ ← Title of conversation v           [Share]  │  │
│S │──────────────────────────────────────────────│  │
│I │                                              │  │
│D │  ┌─────────────────────────────────────┐     │  │
│E │  │ User message (right-aligned, dark)  │     │  │
│B │  └─────────────────────────────────────┘     │  │
│A │                                              │  │
│R │  Thinking summary collapsed >                │  │
│  │                                              │  │
│  │  Response text with **bold**, headers,       │  │
│  │  tables, and [Source.com] citation pills.    │  │
│  │                                              │  │
│  │  ┌────────────────────────────────────────┐  │  │
│  │  │ [</>] Artifact name    [Download]      │  │  │
│  │  │       Code · HTML                      │  │  │
│  │  └────────────────────────────────────────┘  │  │
│  │                                              │  │
│  │  [📋] [👍] [👎] [🔄]                        │  │
│  │                                              │  │
│  │  Follow-ups                                  │  │
│  │  ↩ Suggested question 1                      │  │
│  │  ↩ Suggested question 2                      │  │
│  │──────────────────────────────────────────────│  │
│  │  ┌──────────────────────────────────────┐    │  │
│  │  │ Reply...                             │    │  │
│  │  │ [+][🔍][✏️]  [Opus 4.6 Extended v]  │    │  │
│  │  └──────────────────────────────────────┘    │  │
│  │  Disclaimer                                  │  │
└──┴──────────────────────────────────────────────┴──┘
```

### 4.3 Desktop — Chat with Artifact Panel

```
┌──┬────────────────────────┬─────────────────────┐
│  │ Title v        [Share] │ [👁][</>] Name [✕]  │
│I │────────────────────────│─────────────────────│
│C │                        │                     │
│O │ User message           │  (Live preview      │
│N │                        │   or code view)     │
│S │ Thinking...            │                     │
│  │                        │                     │
│  │ Response text          │                     │
│  │                        │                     │
│  │ [Artifact card]        │                     │
│  │────────────────────────│─────────────────────│
│  │ Reply...  [Model v]    │                     │
└──┴────────────────────────┴─────────────────────┘
 48px     ~50%                    ~50%
```

---

### 4.4 Mobile — Agent Dashboard (Our Differentiator)

```
┌──────────────────────┐
│ ← AGI Workforce      │
│                      │
│ 🟢 Agent Active      │
│ Running: Research... │
│ Model: Opus 4.6      │
│ ─────────────────── │
│ Step 3 of 5          │
│ ▓▓▓▓▓▓▓░░░ 60%      │
│                      │
│ Current action:      │
│ 🌐 Searching web for │
│ "SpaceX Starship..." │
│                      │
│ ┌──────────────────┐ │
│ │  [✓ Approve]     │ │
│ │  [✕ Deny]        │ │
│ │  [⏸ Pause]       │ │
│ └──────────────────┘ │
│                      │
│ Recent actions:      │
│ ✅ Read 3 files      │
│ ✅ Searched web      │
│ ⏳ Writing report... │
└──────────────────────┘
```

### 4.5 Mobile — Chat (Companion)

```
┌──────────────────────┐
│ ← Chats    [+] [⚙]  │
│──────────────────────│
│                      │
│ ┌──────────────────┐ │
│ │ User message     │ │
│ └──────────────────┘ │
│                      │
│ AI response with     │
│ citations [src]      │
│                      │
│ [📋][👍][👎][🔄]    │
│──────────────────────│
│ ┌──────────────────┐ │
│ │ Reply...         │ │
│ │ [+] [Model v] 🎤 │ │
│ └──────────────────┘ │
└──────────────────────┘
```

### 4.6 Web — Chat (Next.js)

```
Same as Desktop 4.2 layout but:
- No native title bar
- Auth via Supabase (login/signup)
- Model selector shows BYOK setup prompt if no keys
- Simplified sidebar (no desktop automation features)
```

### 4.7 Chrome Extension — Side Panel

```
┌──────────────────────┐
│ AGI Workforce   [⚙]  │
│──────────────────────│
│ Current page context │
│ detected: GitHub PR  │
│──────────────────────│
│ AI response inline   │
│──────────────────────│
│ ┌──────────────────┐ │
│ │ Ask about page...│ │
│ │ [+]    [Model v] │ │
│ └──────────────────┘ │
└──────────────────────┘
```

---

## 5. UNIQUE DIFFERENTIATORS TO SURFACE IN UI

| Feature          | How to Surface                                  |
| ---------------- | ----------------------------------------------- |
| Multi-model      | Provider name always visible in model selector  |
| BYOK             | "Your key" amber badge when using BYOK          |
| Local LLMs       | "Local" green badge when using Ollama           |
| 150+ Skills      | Skills in sidebar nav + slash commands          |
| Mobile oversight | Connection status indicator in header           |
| Cost tracking    | Subtle token/cost indicator near model selector |
| Unlimited MCP    | Tool count in Customize page                    |
| Privacy          | Incognito mode + "data stays local" messaging   |

---

## 6. IMPLEMENTATION PRIORITY

### NEW: Interaction Findings from Live Testing (March 21, 2026)

**Claude streaming states observed:**

1. **T+0s**: User message appears right-aligned in darker bubble → greeting + chips disappear → title auto-generates
2. **T+1s**: ✳ orange asterisk (animated spin) + thinking summary text streams live ("Cataloging competing desktop applications...")
3. **T+2s**: 🌐 Web search card appears inline: globe icon + query + "10 results" — results expand with favicon + title + domain rows
4. **T+5s**: Thinking block collapses to one-line summary → response text starts streaming with bold headers
5. **T+8s**: Interactive table renders with **filter chips** (All apps, Proprietary, Open-source, Local LLM support) + **platform badges** (Mac, Windows, Linux pills) + **type badges** (Proprietary/Open-source in colored pills)
6. **T+15s**: Inline citation pills appear: [Theoutpost], [aitoolinsight], [The AI Journal], [GitHub]
7. **Complete**: Action icons (copy, thumbs up/down, retry) + disclaimer changes to "cited sources" + voice icon returns

**New UI patterns discovered:**

- **Interactive filterable tables** — Claude generates clickable filter pills above comparison tables (NOT in current doc!)
- **Notification banner** — "Want to be notified when Claude responds?" + "Notify" button + ✕ — appears for long-running responses
- **Stop button = eye icon** (not square) during streaming
- **Platform/type badges in tables** — small colored pills (Mac, Windows, Linux, Proprietary, Open-source)
- **Thinking summary streams live** — text updates in real-time as thinking progresses, not a static summary
- **Orange asterisk spins** after response completes when Claude processes more

**New components to add to AGI Workforce:**

- `NotificationBanner` — "Want to be notified?" for long responses
- `FilterableTable` — Interactive filter chips above comparison tables
- `PlatformBadge` / `TypeBadge` — Small colored pills for categorization

**ChatGPT streaming states observed:**

1. **T+0s**: User message → greeting disappears → two response cards appear side-by-side (A/B comparison mode)
2. **T+2s**: Both cards show: initial thinking text + "Thought >" collapsible + search status with "Answer now" link
3. **T+5-30s**: Dynamic search status updates per card: "Searching AI desktop assistants...", "Confirming Microsoft pricing...", "Checking Gemini Mac app status..."
4. **Complete**: Cards collapse to headers "Response 1" / "Response 2" — user picks preferred response
5. **Stop button**: Black square (■), input placeholder: "Follow up" → "Ask anything"

**ChatGPT unique patterns:**

- **A/B comparison mode** — two responses generated simultaneously, user picks winner (training feedback)
- **"Answer now"** link — skip waiting, get response with current info
- **"Thought >"** label (not "Thinking") — simpler language
- **Dynamic search status** — text updates in real-time showing what's being searched

**Gemini streaming states observed:**

1. **T+0s**: User message → greeting disappears → sparkle ✦ animated icon + "Show thinking ˅"
2. **T+1s**: Response text **fades in gradually** (transparent → opaque, top to bottom) — unique animation
3. **T+3s**: Table title appears, then columns fade in one by one
4. **T+10s**: Table rows fill in with rich descriptions: App/Platform, Focus & Best For, Key Features, Pros
5. **Complete**: Action bar appears (thumbs up/down, share, retry, more)
6. **Stop button**: Blue square (■), input: "Ask Gemini 3", disclaimer: "Gemini is AI and can make mistakes."

**Gemini unique patterns:**

- **Text fade-in** — paragraphs appear with opacity animation (not typewriter or instant)
- **"Show thinking"** label with ˅ chevron (not "Thought" or summary text)
- **Center-aligned title** in header (not left-aligned)
- **No web search or citations** for this query — Gemini Pro used training data only
- **Plain markdown table** — not interactive/filterable like Claude's
- **Descriptive table columns** — "Focus & Best For" with bold labels ("The Baseline.", "Best for True Autonomy.")
- **Blue stop button** (not black like ChatGPT, not eye like Claude)

**Streaming animation comparison:**
| Platform | Animation | Stop Icon | Thinking Label | Search Display |
|----------|-----------|-----------|---------------|----------------|
| Claude | Instant text appearance | Eye icon (👁) | Auto-summary text + > | Globe + query + "N results" inline |
| ChatGPT | Typewriter (char by char) | Black square (■) | "Thought >" | Status text + "Answer now" link |
| Gemini | Fade-in (transparent → opaque) | Blue square (■) | "Show thinking ˅" | None (training data) |
| Perplexity | Instant text | N/A (search-first) | "Completed N steps >" | Step-by-step with queries + results |

**AGI Workforce recommendation**: Use **Claude's instant text + auto-summary thinking** pattern. It feels fastest and most professional. Add Perplexity's **"Completed N steps"** for web search visibility. Adopt Manus's **agent execution timeline** for our agent mode.

---

## 9. KIMI DEEP DIVE (Live tested March 21, 2026)

### Sidebar

- K logo + copy icon, New Chat (⌘K), Websites, Docs, Slides, Sheets, Deep Research, Kimi Code, Kimi Claw (Beta), Chat History > All Chats, Mobile App, User + Upgrade + ˅

### Empty State

- "KIMI" large white text, "Ask away. Pics work too." placeholder
- Bottom bar: + button, 🤖 Agent button, "K2.5 Instant v" model selector, send ↑
- Quick chips: Websites, Docs, Slides, Sheets, Deep Research, Agent Swarm (Beta)
- "Kimi Claw Is Ready!" banner at bottom

### Model Selector (4 tiers — best model UX!)

| Model                     | Description                                        |
| ------------------------- | -------------------------------------------------- |
| **K2.5 Instant** ✓        | Quick response                                     |
| **K2.5 Thinking**         | Deep thinking for complex questions                |
| **K2.5 Agent**            | Research, slides, websites, docs, sheets           |
| **K2.5 Agent Swarm** Beta | Large-scale search, long-form writing, batch tasks |

### Unique Kimi Features

1. **Dedicated creation modes** in sidebar — Websites, Docs, Slides, Sheets as separate nav items
2. **Agent Swarm** (multi-agent batch) baked into model selector
3. **Kimi Claw** — computer use / automation (like Claude Cowork)
4. **Kimi Code** — dedicated coding mode
5. **"Agent" button** next to + in input bar — separate from model selector
6. **"Pics work too"** — multimodal explicitly mentioned in placeholder
7. **Mobile App** link in sidebar

### AGI Workforce Takeaways from Kimi

- **Dedicated creation pages** (Websites, Docs, Slides, Sheets) = our Skills rendered as dedicated pages
- **4-tier model selector** with Agent/Swarm modes — we should integrate agent mode into model selector
- **Agent button** separate from + is a clean pattern
- **"Agent Swarm" for batch tasks** — multi-agent orchestration as a model tier is innovative

---

## 10. MANUS DEEP DIVE (Live tested March 21, 2026)

### Sidebar

- manus logo, New task, Agents (New), Search, Library, Projects (+ New project), All tasks (with filter), task list, Share referral, Settings/Grid/Monitor icons, "from ∞ Meta"

### Empty State

- "Manus 1.6 Lite v" model in header center, ✦ 1,243 credits counter
- "Assign a task or ask anything" placeholder (task-first framing!)
- Bottom bar: + button, 🔧 tools icon, emoji 😀, mic 🎤, send ↑
- "Connect your tools to Manus" banner: Chrome, Gmail, Notion, Drive, GitHub icons + ✕
- "Download Manus for Windows or macOS" banner at bottom

### Agents Page

- "Deploy your agent for _business_" heading
- 4 feature cards: Brand-consistent AI identity, Persistent memory & computer, Custom skills, Works in your messenger
- Messaging platforms: Telegram (active), WhatsApp/Messenger/Line (coming soon)
- Agents are deployed AS chatbots on messaging platforms — fundamentally different model

### Task Execution UI (Most transparent agent UI!)

```
┌──────────────────────────────────────────────────┐
│ 🤖 manus  [Lite]                                │
│                                                  │
│ I'll research the top 3 AI desktop applications  │
│ for March 2026...                                │
│                                                  │
│ ✅ Search for top AI desktop apps in March 2026 ˄│
│   │ 🔍 Search for the top AI desktop apps...    │
│   │                                              │
│   │ I've found multiple sources listing...       │
│   │                                              │
│   │ 🌐 Visit a16z and other sources...          │
│   │ 🔍 Find "desktop" in the a16z page...       │
│   │ 🔍 Find specific rankings for top 3...       │
│   │                                              │
│   │ I found that voice-related AI apps...        │
│   │                                              │
│   │ 🌐 Read the Manus blog post to see why...   │
│                                                  │
│ [📄 Document thumbnail preview]                  │
│                                                  │
│ ✅ Deliver findings to the user        2/2  ˄   │
│──────────────────────────────────────────────────│
│ ✓ Task completed    How was this result? ★★★★★  │
│──────────────────────────────────────────────────│
│ Suggested follow-ups                             │
│ 📋 Create a presentation comparing features...  →│
│ 🌐 Generate a webpage summarizing...            →│
│ 📅 Set up automatic weekly updates...            →│
└──────────────────────────────────────────────────┘
```

### Unique Manus Features

1. **Task-first framing** — "Assign a task" not "Ask anything"
2. **Credits system** — ✦ 1,243 credits visible in header (usage-based billing)
3. **Agent execution timeline** — collapsible steps with action pills (search 🔍, browse 🌐)
4. **Planning text** — explicit "I'll do X" before starting (transparency)
5. **Step counter** — "2/2" fraction showing progress
6. **Star rating** — ★★★★★ feedback on completed tasks
7. **Suggested follow-ups** with icons — presentation 📋, webpage 🌐, scheduled 📅
8. **"Deliver findings"** — explicit delivery/handoff step
9. **Document thumbnails** — visual preview of created documents
10. **Tool connection banner** — inline "Connect your tools" with app icons
11. **"from Meta"** branding — Meta-backed
12. **Emoji picker** — dedicated 😀 button (unique)
13. **Library** — saved content/templates page
14. **Desktop app** — native Mac/Windows download

### AGI Workforce Takeaways from Manus

- **Agent execution timeline is the best pattern for our agent mode** — visible steps with search/browse actions, summaries between steps, step counter
- **Star rating on tasks** — user feedback mechanism (consider for our agent approvals)
- **Suggested follow-ups with action types** — create presentation, generate webpage, schedule updates (not just questions)
- **"Assign a task" framing** — task-oriented for agent mode, chat-oriented for regular mode
- **Credits counter in header** — transparent cost tracking (we should show token/cost)
- **Tool connection banner** — inline CTA to connect apps (great for onboarding)
- **"Deliver findings"** — explicit completion step (our agent should have this)

---

## 11. COMPLETE COMPETITIVE TABLE (All 7 platforms)

| Feature                | Claude          | ChatGPT        | Perplexity     | Gemini             | Kimi                            | Manus                   | AGI Workforce        |
| ---------------------- | --------------- | -------------- | -------------- | ------------------ | ------------------------------- | ----------------------- | -------------------- |
| **Multi-model**        | No              | No             | Yes (7)        | No                 | No                              | No                      | **Yes (9+)**         |
| **BYOK**               | No              | No             | No             | No                 | No                              | No                      | **Yes**              |
| **Local LLMs**         | No              | No             | No             | No                 | No                              | No                      | **Yes**              |
| **Agent execution UI** | Inline thinking | Activity panel | Steps          | Show thinking      | Agent mode                      | **Best: timeline**      | Needs redesign       |
| **Follow-ups**         | No              | No             | **Yes**        | No                 | No                              | **Yes (actions)**       | P0 build             |
| **Star rating**        | Thumbs          | Thumbs         | Thumbs         | Thumbs             | ?                               | **★★★★★**               | Consider             |
| **Step counter**       | No              | No             | "N steps"      | No                 | No                              | **"2/2"**               | Add to agent         |
| **Doc creation**       | Slides/Docs     | Canvas         | No             | Canvas/Video/Music | **Websites/Docs/Slides/Sheets** | Documents               | Via skills           |
| **Agent deploy**       | Cowork (VM)     | Agent mode     | Computer       | Tools              | Kimi Claw                       | **Messaging platforms** | Native desktop       |
| **Multi-agent**        | No              | No             | No             | No                 | **Agent Swarm**                 | No                      | **Swarm system**     |
| **Credits/cost**       | Usage limits    | Usage limits   | Usage limits   | Usage limits       | Upgrade                         | **✦ Credits**           | **BYOK = API costs** |
| **Tool connect**       | 40+ marketplace | GPTs           | Source filters | Google apps        | Agent button                    | **Inline banner**       | MCP unlimited        |
| **Task framing**       | Chat            | Chat           | Search         | Chat               | Chat                            | **"Assign a task"**     | Both chat + task     |

---

## 12. IMAGE GENERATION UX (Live tested March 21, 2026)

### ChatGPT (DALL-E) — Fastest, best UX

**Loading**: "Creating image • [auto-generated description]" status text → image progressively renders (blur → sharp)
**Complete**: "Image created • Futuristic workspace with robotic assistant" status text → full image inline, large (~80% width)
**Action icons** (below image): Copy (📋), Download (↑), More (···) — 3 icons
**Mobile push notification**: ChatGPT icon + "Futuristic workspace with robotic assi..." + "Your image is ready to review" + "now" — sent to iPhone lock screen
**Key detail**: Image appears VERY fast (~8 seconds). No side panel — fully inline.

### Gemini (Imagen) — Clean, slower

**Loading**: ✦ sparkle animation + "Creating your image..." status text → faint progressive area visible
**Complete**: Image renders inline (~60% width), no status text — just the image directly
**Action icons** (overlaid on image, top-right): Share (↗), Copy (📋), Download (↓) — 3 icons on hover
**Watermark**: Small Gemini sparkle ✦ (bottom-right corner of image)
**Key detail**: Slower than ChatGPT (~20 seconds). Action icons overlay ON the image, not below it.

### Claude — No native image gen

Claude does NOT have native image generation. Uses code execution (matplotlib/plotly) for charts/visualizations, shown as PNG artifacts in right panel.

### Image Gen Comparison

|                     | ChatGPT                       | Gemini                          | AGI Workforce           |
| ------------------- | ----------------------------- | ------------------------------- | ----------------------- |
| Status text         | "Image created • [desc]"      | "Creating your image..." → none | Need to implement       |
| Image position      | Inline, large (~80% width)    | Inline, medium (~60% width)     | Inline (follow ChatGPT) |
| Action icons        | Below image (3)               | Overlaid on image (3)           | Below (follow ChatGPT)  |
| Watermark           | None                          | ✦ sparkle bottom-right          | Optional brand mark     |
| Speed               | ~8 seconds                    | ~20 seconds                     | Via MCP tools (varies)  |
| Mobile notification | **Yes — push to lock screen** | Not tested                      | **P1 — must implement** |
| Progressive render  | Blur → sharp                  | Faint area → full               | Follow ChatGPT          |

### AGI Workforce SHOULD DO

- "Creating image • [auto-description]" inline status (follow ChatGPT)
- Progressive render: blur → sharp if provider supports it
- Action icons below image: Copy, Download, More
- **Mobile push notification when image is ready** — critical for our mobile companion
- No side panel for images — everything inline

---

## 13. CODE EXECUTION UX (Live tested March 21, 2026)

### Claude (Code Execution + Artifact Panel)

**Flow**: User asks for a chart → Claude writes Python → executes in sandbox → renders PNG
**Thinking block**: Shows tool call steps inline (script creation, execution)
**Result**: PNG artifact opens in **right panel** — "AI market share · PNG" header
**Panel header** (for images/PNGs): Title · PNG + Download (↓) + Retry (↻) + Close (×) — NO preview/code toggle (only for HTML/code artifacts)
**Chat side**: Response text with analysis + "Notify" banner + action icons
**Key insight**: Code execution output = image artifact in panel. Code itself is in the thinking block, not shown separately.

**Chart rendered**: Full bar chart "AI Desktop App Market Share — Q1 2026 (Estimated)" with color-coded bars, % labels, axis labels, footnote

### Code Execution Comparison

|                 | Claude                               | ChatGPT              | Gemini          | AGI Workforce        |
| --------------- | ------------------------------------ | -------------------- | --------------- | -------------------- |
| Code execution  | Sandbox (Python)                     | Code interpreter     | Code execution  | code_execute command |
| Output display  | PNG artifact panel                   | Inline image         | Inline image    | Needs implementation |
| Code visibility | Inside thinking block                | In Canvas/code block | Inside thinking | Thinking block       |
| Panel header    | "Title · PNG" + Download/Retry/Close | N/A (inline)         | N/A (inline)    | Match Claude         |

### AGI Workforce SHOULD DO

- Code execution output as **inline visualization** (follow ChatGPT/Gemini) OR right panel (follow Claude)
- Charts/graphs rendered inline with Download button
- Code visible in collapsible thinking block
- Support matplotlib, plotly, d3 output formats

---

## 14. MOBILE PUSH NOTIFICATIONS (Live tested March 21, 2026)

### ChatGPT — Best implementation

**iOS Lock Screen notification**:

```
┌──────────────────────────────────────┐
│ [ChatGPT icon]                  now  │
│ Futuristic workspace with robotic... │
│ Your image is ready to review        │
└──────────────────────────────────────┘
```

- App icon (swirl logo) + auto-generated title (truncated) + "Your image is ready to review" body + "now" timestamp
- Sent for: image generation, deep research, long responses
- Configured in Settings > Notifications: Push/Email per category (Responses, Group chats, Tasks, Projects, Recommendations, Usage)

### Claude — "Want to be notified?" banner

**In-app banner** (not push notification):

```
┌──────────────────────────────────────────────────┐
│ Want to be notified when Claude responds? [Notify] × │
└──────────────────────────────────────────────────┘
```

- Appears inline in chat for long-running responses
- "Notify" button + ✕ dismiss
- Browser notification, not native push

### AGI Workforce SHOULD DO

- **Native push notifications** to mobile companion app (our QR-pair differentiator)
- Notification types: agent task complete, tool approval needed, image ready, research done
- In-app banner: "Want to be notified?" for web/desktop
- Notification settings: per-category Push/Email/None toggles (follow ChatGPT)

---

### P0 — Must ship (blocks launch)

1. Personalized greeting + quick chips on empty state
2. Thinking block auto-summary + icon vocabulary + vertical timeline
3. Inline citations (pill badges after sentences)
4. Download card (inline in chat)
5. Follow-up suggestions below responses
6. Active feature badges (blue icons next to +)
7. Context-aware disclaimer

### P1 — Competitive parity (ship within 2 weeks)

8. Customize hub (Skills + Connectors unified page)
9. Connector marketplace browse modal
10. Research card with source count + time
11. Incognito visual treatment (dashed border, lock header)
12. "Type / for skills" placeholder + slash command menu
13. Connectors per-conversation toggles in + menu

### P2 — Differentiation (ship within 1 month)

14. Mobile companion agent dashboard
15. Model council (multi-model consensus)
16. Import memory from other AI providers
17. Personalization style controls
18. Temporary/private chat mode
19. Source filters (Web, Academic, Social)
20. Artifact gallery with Inspiration templates

---

---

## 7. GEMINI FINDINGS (Live tested March 21, 2026)

### Key UI Patterns

- **Greeting**: Gemini sparkle ✦ + "Hi Siddhartha" + "What's new today?"
- **Input**: "Ask Gemini 3" (model name IN placeholder, not separate)
- **Bottom bar**: + button | ⚙ Tools | "Pro v" model picker | mic
- **Quick chips** (2 rows): For you, Create image, Create music, Help me learn, Write anything, Boost my day
- **Sidebar** (default collapsed): hamburger ☰, new chat 📝, settings ⚙. Expanded: New chat, My stuff, Gems section, Chats (with pin icons), Settings & help
- **Model picker**: Fast / Thinking / Pro — descriptive names, not version numbers

### Tools Menu (separate from +)

- 🎨 Create image — "New" badge
- 📝 Canvas — collaborative editing
- 🔬 Deep research
- 🎬 Create video — **unique to Gemini!**
- 🎵 Create music — "New" badge — **unique to Gemini!**
- 📚 Guided learning — education mode
- **Experimental features** (⚠ Labs):
  - Personal Intelligence — "Personalize chat when helpful" — toggle ON — uses Google data

### Gems (= Claude Skills / ChatGPT GPTs)

- Custom AI personas with specific instructions
- Listed in sidebar under "Gems" section
- User-created (CodeXmind-python, prompt creator for claude)

### Unique Gemini Differentiators

1. **Video generation** — inline, no third-party API needed
2. **Music generation** — unique capability
3. **Personal Intelligence** — uses Gmail, Calendar, Drive for personalized responses (Google ecosystem advantage)
4. **Guided learning** — education-focused mode with interactive teaching
5. **Descriptive model names** (Fast/Thinking/Pro vs Haiku/Sonnet/Opus)
6. **"My stuff"** — saved items/favorites page
7. **Fullscreen mode** button in header

### AGI Workforce Takeaways from Gemini

- Consider **descriptive model tier labels** alongside technical names (e.g., "Fast" under Haiku, "Powerful" under Opus)
- **Create video** and **Create music** are differentiators we can match via MCP tools (Runway, Suno integrations)
- **Personal Intelligence** concept = our memory + connectors combined
- **"My stuff"** = bookmarked/saved items page (we have bookmarks in messages)
- **Tools as a separate button** from + is interesting — cleaner separation of "attach" vs "mode"

---

## 8. FINAL COMPETITIVE COMPARISON (All 5 platforms)

| Feature             | Claude              | ChatGPT               | Perplexity        | Gemini                | AGI Workforce        |
| ------------------- | ------------------- | --------------------- | ----------------- | --------------------- | -------------------- |
| **Multi-model**     | No                  | No                    | Yes (7)           | No                    | **Yes (9+)**         |
| **BYOK**            | No                  | No                    | No                | No                    | **Yes**              |
| **Local LLMs**      | No                  | No                    | No                | No                    | **Yes**              |
| **Connectors**      | 40+ marketplace     | GPTs                  | Source filters    | Google apps           | MCP unlimited        |
| **Skills/Gems**     | 10 examples         | GPTs                  | —                 | Gems                  | **150+**             |
| **Research**        | 438 src / 13min     | Deep research         | Deep research     | Deep research         | Yes (needs UI)       |
| **Video gen**       | No                  | No                    | No                | **Yes (native)**      | Via MCP tools        |
| **Music gen**       | No                  | No                    | No                | **Yes (native)**      | Via MCP tools        |
| **Image gen**       | No                  | Yes (DALL-E)          | No                | Yes (Imagen)          | Via MCP tools        |
| **Finance**         | No                  | No                    | **Full terminal** | No                    | Skill-based          |
| **News feed**       | No                  | No                    | **Discover**      | No                    | —                    |
| **Desktop auto**    | Cowork (VM)         | No                    | Computer          | No                    | **Native**           |
| **Mobile**          | iOS/Android         | iOS/Android           | iOS/Android       | iOS/Android           | **QR + dashboard**   |
| **Incognito**       | Yes (dashed border) | Temp chat             | —                 | —                     | **Yes**              |
| **Thinking UI**     | Inline collapsible  | Side panel            | Steps collapsible | Show thinking         | Inline (P0 fix)      |
| **Citations**       | Inline pills        | "+N" pills            | "+N" pills        | None inline           | P0 build             |
| **Follow-ups**      | No                  | No                    | **Yes (best)**    | No                    | P0 build             |
| **Voice**           | Voice + equalizer   | Voice mode + personas | Voice mode        | Voice mode            | **Full personas**    |
| **Canvas**          | Artifacts panel     | Canvas                | —                 | Canvas                | Artifact system      |
| **Personalization** | Preferences text    | Style sliders         | —                 | Personal Intelligence | Custom instructions  |
| **Pricing**         | $20-$100/mo         | $20-$200/mo           | $20/mo Pro        | $20/mo (or free)      | **BYOK = API costs** |

### Where AGI Workforce WINS (unique advantages no competitor has):

1. **Multi-model + BYOK + Local LLMs** — the trifecta nobody else offers
2. **150+ non-coding skills** — healthcare, legal, finance, education
3. **Native desktop automation** — not a VM (Claude) or browser-only (Perplexity)
4. **Unlimited MCP tools** — no caps (Cursor = 40, Windsurf = 21)
5. **Mobile companion with agent oversight** — approve/deny from phone
6. **Privacy moat** — local execution + BYOK + incognito = data never leaves device

---

_This PRD is derived from live competitive testing of Claude.ai, ChatGPT, Perplexity.ai, and Gemini on March 21, 2026. See `docs/PRODUCT_SINGLE_SOURCE_OF_TRUTH.md` for the raw research data._
