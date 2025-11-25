# Claude Desktop: Complete UI/UX Reverse-Engineering Specification

**Anthropic's native macOS/Windows application as of November 2025**

Claude Desktop is Anthropic's native desktop application that brings Claude AI directly to the user's computer with deep local system integration. Launched as a public beta on October 31, 2024, it differentiates from Claude Web through **Quick Entry summoning** (double-tap Option on macOS), **Desktop Extensions** via the Model Context Protocol (MCP), native file/window sharing, and voice dictation. The app follows a two-panel design with a collapsible sidebar, main chat canvas, and contextual artifacts panel—optimized for focused, deep work with local tool integration.

---

## 1. High-level architecture and primary use cases

Claude Desktop serves as a standalone interface enabling seamless integration with local files, desktop applications, and external services. Primary use cases include focused AI-assisted writing, coding assistance with terminal access, document creation and editing, research workflows, and enterprise deployment with admin controls.

**Platform support:** macOS 11+ (Big Sur), Windows 10/11. Quick Entry requires macOS 12+, voice dictation requires macOS 14+ (Sonoma). Distributed as **PKG** (macOS, ~185MB) and **MSIX** (Windows, enterprise-ready) installers.

### How Claude Desktop differs from Claude Web

| Aspect             | Claude Desktop                   | Claude Web                   |
| ------------------ | -------------------------------- | ---------------------------- |
| Access method      | Native app with global hotkey    | Browser tab                  |
| Quick Entry        | Double-tap Option (Mac)          | Not available                |
| Memory footprint   | ~180-400MB typically             | 1.2-2.0GB per browser tab    |
| File handling      | Native drag-drop, window sharing | Browser file upload          |
| Desktop Extensions | Local MCP servers (.mcpb)        | Remote connectors only       |
| Voice input        | Native dictation via Caps Lock   | Requires browser permissions |
| Cold start         | ~3 seconds                       | ~10-12 seconds               |

---

## 2. Core layout and component architecture

The application uses a **three-surface design**: left sidebar for navigation, center chat canvas for conversation, and right artifacts panel for substantial content output.

```
┌──────────────────────────────────────────────────────────────┐
│ [Window Chrome / Title Bar]                                   │
├─────────────┬────────────────────────────────────────────────┤
│             │                                                 │
│  SIDEBAR    │         MAIN CHAT CANVAS                        │
│  (~250px)   │                                                 │
│             │   ┌────────────────────────────────────────┐    │
│ • Recent    │   │     Conversation Thread                │    │
│   Chats     │   │     (max-width centered)               │    │
│             │   ├────────────────────┬───────────────────┤    │
│ • Projects  │   │   Message Stream   │  ARTIFACTS PANEL  │    │
│             │   │                    │  (contextual)     │    │
│ • Artifacts │   │                    │                   │    │
│             │   │                    │  Code / Preview   │    │
│ ───────────-│   └────────────────────┴───────────────────┘    │
│ [Profile/   │   ┌────────────────────────────────────────┐    │
│  Settings]  │   │  Message Input Composer                │    │
└─────────────┴───┴────────────────────────────────────────┴────┘
```

### 2.1 Application shell

**Window chrome:** Uses platform-native window controls—standard traffic light buttons (close/minimize/zoom) on macOS, minimize/maximize/close on Windows. No custom title bar documented.

**Global keyboard shortcuts (confirmed):**

| Platform | Shortcut           | Action                     |
| -------- | ------------------ | -------------------------- |
| macOS    | Double-tap Option  | Open Quick Entry           |
| macOS    | Option + Space     | Alternative Quick Entry    |
| macOS    | Caps Lock (press)  | Start/stop voice dictation |
| macOS    | Cmd + K            | Create new chat            |
| Windows  | Ctrl + Alt + Space | Summon window              |
| Both     | Enter              | Send message               |
| Both     | Shift + Enter      | New line in message        |
| Both     | Ctrl/Cmd + ,       | Open Settings              |

**Menu bar (macOS):** Standard structure with Claude menu (About, Preferences, Quit), File (New Chat, Close Window), Edit, View, Window, and Help menus.

### 2.2 Sidebar/Navigation panel

The sidebar is **collapsible via toggle** (changed from hover behavior in late 2024). Estimated width is approximately **250-280px** based on standard desktop conventions.

**Sections included:**

- **New Chat** button (top)
- **Recent conversations** (chronological list)
- **Projects** section (paid plans—organized workspaces with shared context)
- **Artifacts space** (dedicated area for viewing created artifacts)
- **Profile/initials icon** (bottom left—access to Settings menu)

**Hover/selection behavior:** Conversations highlight on hover; selected conversation shows distinct background color. Search functionality available for paid plans using RAG-based retrieval across conversation history.

### 2.3 Main chat canvas

The conversation thread uses a **centered max-width layout** within the canvas area, optimizing readability. Messages alternate between user and Claude responses with clear visual differentiation.

**Message stream layout:**

- **User messages:** Right-aligned or distinct styling with user indicator
- **Claude responses:** Left-aligned with Claude attribution
- **Streaming text:** Arrives in word/phrase chunks via SSE (not character-by-character)
- **Auto-scroll:** Automatically follows new content; pauses when user scrolls up manually

**Long content handling:** Substantial outputs exceeding **~15 lines** or **1,500+ characters** automatically trigger the Artifacts panel rather than rendering inline.

### 2.4 Input area/Composer

**Positioning:** Fixed at bottom of chat canvas

**Textarea behavior:**

- Auto-expands as user types (multiline support)
- Shift + Enter creates line breaks
- Enter sends message

**Available controls:**

- **Send button** (right side of input)
- **Attachments:** Drag-and-drop for PDFs, CSVs, DOCXs, images, PPTXs
- **Model selector:** Switch between Claude Sonnet 4.5, Opus 4.1, Haiku 3.5
- **Web Search toggle:** Enables automatic web search based on query context
- **MCP indicator:** Hammer/tools icon (bottom-right) when MCP servers connected

**macOS-exclusive features:** Screenshot capture button, window sharing, voice dictation indicator (orange cloud)

### 2.5 Side panels (Artifacts)

The artifacts panel appears **contextually on the right side** when Claude generates substantial standalone content.

**Panel controls:**

- **Two tabs:** "Code" (raw content) and "Preview" (rendered output)
- **Version selector:** Bottom-left slider for iterating between artifact versions
- **Actions:** View, copy, download, publish (shareable link), remix
- **Close button (X):** Hides panel
- **Slider icon:** Access multiple artifacts within conversation

**Supported artifact types:**

- Code snippets (syntax-highlighted)
- Markdown/plain text documents
- HTML webpages with CSS/JavaScript
- SVG graphics
- Mermaid diagrams
- Interactive React applications
- Data visualizations

**Panel behavior:** Opens automatically for qualifying content; has independent scrolling; content streams in real-time during generation.

---

## 3. End-to-end interaction flows

### 3.1 Basic chat message (no tools)

**Submission sequence:**

1. User types in composer and presses Enter (or clicks Send)
2. User message immediately appears in chat stream
3. "Claude is thinking..." indicator activates with animated toggle
4. Response streams via Server-Sent Events (SSE)

**SSE event sequence:**

```
message_start → content_block_start → content_block_delta (repeated) →
ping (periodic) → content_block_stop → message_stop
```

**Streaming granularity:** Text arrives in **word or partial-phrase chunks**, not character-by-character. Example deltas: `"I'll check"` → `" the current weather"` → `" for you."`

**Scroll behavior:** Auto-scrolls during streaming; pauses if user scrolls up; resumes when user returns to bottom. Stop reason (`end_turn`, `stop_sequence`) returned at completion.

### 3.2 Tool/MCP/Connector invocation

**Intent detection:** Claude analyzes the request and determines whether a tool or artifact is beneficial for the task.

**Document creation flow ("Create a project plan"):**

1. Claude decides artifact creation is appropriate
2. Artifacts panel opens on right side
3. Content streams into panel with Code/Preview tabs
4. User can switch tabs to see raw content vs rendered output
5. On completion, version history becomes available
6. User can edit via "Improve" (describe changes) or "Explain" (get explanation)

**MCP tool invocation:**

1. **Permission prompt appears** (first-time use):
   - "Allow" (single use)
   - "Always approve" (permanent for this tool)
   - "Deny"
2. Tool executes with visual feedback (loading indicators)
3. Results display inline or update artifacts panel
4. Completion state shows final output with any errors surfaced

**UI feedback during tool use:**

- Badge/tag indicating tool being used
- Progress indicators during execution
- Tool output logged in conversation
- "Fix with Claude" button if errors detected

### 3.3 Terminal/System-level actions

**Enabling terminal tools:**

1. Navigate to **Settings > Extensions**
2. Click "Browse extensions" for Anthropic-reviewed tools
3. Install desired extension
4. Configure required API keys through UI
5. Restart Claude Desktop to load servers

**Permission prompts:** All tool operations require **explicit user approval** before execution. System-level permissions (Screen Recording, Accessibility, Microphone on macOS) requested via OS-native dialogs on first use.

**Command execution display (Claude Code):**

- Diff view shows file changes with red/green backgrounds
- Terminal output displayed inline
- Commands logged with descriptions
- Error messages surfaced with retry options

**Approval UI hierarchy:**

1. PreToolUse hooks (programmatic allow/deny)
2. Deny rules checked first
3. Allow rules if no deny match
4. User prompt if not covered by rules

---

## 4. Model Context Protocol (MCP) system

MCP is an **open standard introduced November 2024** enabling standardized integration between LLM applications and external tools/data sources.

### Architecture

**Components:**

- **Hosts:** Applications initiating connections (Claude Desktop)
- **Clients:** Connectors managing server relationships (1:1 with servers)
- **Servers:** Programs exposing tools, resources, and prompts

**Protocol details:**

- **Transport:** stdio (local servers) or HTTP with SSE (remote)
- **Message format:** JSON-RPC 2.0
- **Message types:** Requests, Notifications, Responses

**Server capabilities exposed:**

- **Tools** (model-controlled): Functions for actions
- **Resources** (application-controlled): Data sources
- **Prompts** (user-controlled): Pre-defined templates

### Configuration

**File locations:**

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Configuration format:**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/files"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<TOKEN>"
      }
    }
  }
}
```

### Desktop Extensions (.mcpb)

Introduced **June 2025**, Desktop Extensions provide one-click MCP server installation with built-in Node.js runtime.

**Installation methods:**

1. Settings > Extensions > Browse extensions (official directory)
2. Settings > Extensions > Advanced settings > Install Extension... (custom .mcpb files)

**Security:** Sensitive credentials stored in OS keychain (Keychain on macOS, Credential Manager on Windows).

### Pre-built MCP servers (Anthropic reference implementations)

Filesystem, GitHub, Git, PostgreSQL, SQLite, Google Drive, Slack, Puppeteer, Brave Search, Google Maps, Memory, Sentry, EverArt.

---

## 5. Content rendering specifications

### Markdown rendering

Full support including headings (H1-H6), ordered/unordered lists, tables, links, blockquotes, bold/italic/code inline formatting, and nested structures.

### Code blocks

- **Syntax highlighting:** Language-specific coloring (Pygments-based)
- **Language labels:** Display detected/specified language
- **Copy button:** One-click clipboard functionality
- **Edit interactions:** "Improve" (describe changes) or "Explain" (get walkthrough)

**Artifact code types:**

- `application/vnd.ant.code` — Code snippets
- `text/html` — Rendered HTML
- `image/svg+xml` — SVG graphics
- `application/vnd.ant.mermaid` — Mermaid diagrams

### Documents vs messages

**Normal messages:** Inline in chat stream as text  
**Artifacts:** Right-side panel for content that is substantial (15+ lines), self-contained, and likely to be edited/reused

### Version control

Artifacts maintain version history accessible via slider icon. Users can navigate between iterations, and modifying an earlier version creates a new branch without affecting the original.

### Export/Share options

- **Download:** Direct file export (HTML, code)
- **Publish:** Generate shareable URL
- **Remix:** Others can create copies to modify
- **View-only:** Non-logged users can view and interact but not modify

---

## 6. Visual design system

### Color palette

**Brand colors:**
| Role | Hex | RGB |
|------|-----|-----|
| Primary Terra Cotta | `#da7756` | 218, 119, 86 |
| Website Background | `#eeece2` | 238, 236, 226 |
| Text Color | `#3d3929` | 61, 57, 41 |
| Chat Buttons | `#bd5d3a` | 189, 93, 58 |

**Light theme palette (derived):**
| Element | Hex |
|---------|-----|
| Background | `#FAF9F5` |
| Foreground | `#1F1E1D` |
| Accent/Links | `#1C6BBB` |
| Emphasis | `#C96442` |
| Keywords | `#D73A83` |
| Functions | `#1F6FE4` |
| Strings | `#26831A` |
| Comments | `#6F6F78` |

**Theme modes:** Light, Dark, Match System (follows OS preference)

### Typography

**Brand typefaces (from Geist design agency):**

- **Primary:** Styrene (Commercial Type)—technically refined
- **Secondary:** Tiempos (Klim Type Foundry)—charmingly quirky

**Website body stack:** `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`

**Chat font:** Customizable in Settings > Appearance

### Spacing scale

```css
space-2: 8px   /* Button groups */
space-3: 12px  /* Compact components */
space-4: 16px  /* Standard padding */
space-5: 20px  /* Form sections */
space-6: 24px  /* Page containers */
```

### Border radius values

| Token        | Value    | Usage                                    |
| ------------ | -------- | ---------------------------------------- |
| rounded-md   | 6px      | Small elements                           |
| rounded-lg   | 8px      | Icon buttons                             |
| rounded-xl   | **12px** | Cards, inputs, buttons, modals (primary) |
| rounded-full | 50%      | Pills, badges                            |

### Shadow/Elevation

Standard elevation scale: shadow-sm (subtle), shadow-md (cards), shadow-lg (primary buttons), shadow-xl (modals/dialogs).

### Motion and animation

**Timing:** Sweet spot of **200-400ms** for UI animations  
**Easing:** `ease-out` preferred (starts fast, ends slow)  
**GPU-optimized:** Transform and opacity over width/height

**"Thinking" animation:** Animated logo with dynamic text messages ("Pondering, stand by...") that change based on wait duration. Claude Code uses ASCII flower spinner: `· ✻ ✽ ✶ ✳ ✢`

**Transitions:** Hover/focus use `transition: all 0.2s`, cards use `transform: translateY(-2px)` on hover.

---

## 7. Settings, account, and plans

### Settings access

- **Keyboard:** Ctrl/Cmd + ,
- **UI:** Click initials (bottom-left) > Settings

**Settings categories:**
| Section | Contents |
|---------|----------|
| General | Basic app preferences |
| Account | Profile info, account deletion |
| Billing | Plan display, payment methods |
| Privacy | Data export, training opt-out |
| Appearance | Theme, chat font |
| Extensions | MCP directory, installed extensions |
| Developer | Edit Config, debug logs |
| Connectors | Third-party integrations |
| Claude Code | Authorization tokens |

### Authentication methods

Claude uses **passwordless authentication**:

- Google OAuth
- Apple Sign-in
- Email magic links (no passwords)
- SSO for Team/Enterprise
- SCIM for automated provisioning (Enterprise)

### Plan tiers and limits

| Plan       | Price             | Key Limits                       |
| ---------- | ----------------- | -------------------------------- |
| Free       | $0                | ~50 messages/day                 |
| Pro        | $20/month         | ~45 messages/5 hours, all models |
| Max        | $100-200/month    | 5-20x Pro limits                 |
| Team       | $25-30/user/month | 25,000 messages/seat/week        |
| Enterprise | Custom            | Higher limits, 500K context      |

**Context windows:** Standard 200K tokens, Enterprise Sonnet 4.5 500K, API Sonnet 4.5 1M.

### Usage display

- Session-based limits (5-hour windows for Pro/Max)
- Warning threshold at **10,000 tokens** for MCP output
- Default MCP maximum: **25,000 tokens** (configurable)
- Auto-summarization when approaching context limits (paid plans)
- `/cost` command in Claude Code shows token statistics

---

## 8. UX patterns and design system components

### Button patterns

```css
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  border-radius: 12px;
  transition: all 0.2s ease;
}
/* Variants: primary, secondary, ghost */
/* Sizes: sm, md, lg */
```

### Input fields

```css
padding: 12px 16px;
border: 1px solid [border-color];
border-radius: 12px;
background: semi-transparent with backdrop-blur;
transition: all 0.2s;
```

### Card patterns

- **Elevated:** `box-shadow: var(--shadow-md)`
- **Outlined:** `border: 1px solid var(--color-border)`
- **Interactive hover:** `transform: translateY(-2px); box-shadow: var(--shadow-lg)`
- **Focus state:** `outline: 2px solid var(--color-focus); outline-offset: 2px`

### Modal/Dialog

Focus trap implementation, semantic `role="dialog" aria-modal="true"`, first focusable element receives focus on open, focus restored on close.

### Technology stack indicators

- React-based components
- Tailwind CSS styling
- shadcn/ui component patterns
- Framer Motion for animations
- Glassmorphism effects (backdrop-blur, semi-transparent backgrounds)

### Accessibility

WCAG 2.1 AA compliance emphasis with semantic HTML, keyboard navigation, ARIA labels, proper focus management, and color contrast requirements.

---

## 9. Platform-specific features

### macOS exclusive

- **Quick Entry:** Double-tap Option to summon overlay from any app
- **Screenshot capture:** One-click screen capture in Quick Entry
- **Window sharing:** Share application windows directly
- **Voice dictation:** Caps Lock trigger (macOS 14+)
- **Voice indicator:** Orange cloud during dictation

### Windows

- MSIX installer for enterprise deployment
- Ctrl + Alt + Space to summon window
- Standard keyboard shortcuts
- No screenshot/voice input currently

### Enterprise deployment

**Policy controls:**

- `isDxtEnabled` — Enable/disable desktop extensions
- `isDxtDirectoryEnabled` — Control public directory access
- `isDxtSignatureRequired` — Require extension signatures
- `isLocalDevMcpEnabled` — Enable developer MCP servers

**Paths:**

- macOS: `/Library/Application Support/Claude/`
- Windows: `C:\ProgramData\Claude\`

---

## 10. Known limitations and undocumented specifications

Anthropic has not publicly released detailed design system documentation. The following remain undocumented:

- Exact sidebar width in pixels
- Precise max-width values for chat content
- Specific padding/margin measurements
- Animation duration curves and timing functions
- Message bubble exact styling specifications
- Auto-resize limits for textarea
- Character/token limit displays
- Panel resizability drag handle specifications
- Split view pixel breakpoints
- Multi-window support details

**Confidence levels:**
| Information Type | Confidence |
|------------------|------------|
| Release dates, system requirements | Confirmed (official sources) |
| Keyboard shortcuts, Quick Entry | Confirmed (official support articles) |
| UI layout structure | Confirmed (consistent across sources) |
| MCP protocol details | Confirmed (official specification) |
| Desktop Extensions architecture | Confirmed (Anthropic engineering blog) |
| Exact pixel measurements | Inferred (not officially documented) |
| Window chrome styling | Inferred (platform conventions) |
| Color hex values | Partially confirmed (third-party extraction) |

---

## Conclusion

Claude Desktop represents Anthropic's strategic move toward deep local integration, differentiating from browser-based assistants through native system access, MCP-powered tooling, and platform-optimized features. The architecture prioritizes a **focused, distraction-free workspace** with a clean two-panel design that scales to three panels when artifacts are generated.

Key design decisions include the **contextual artifacts panel** that prevents chat overflow for substantial content, the **permission-first MCP model** that balances capability with security, and **platform-native features** like Quick Entry that leverage OS capabilities unavailable to web apps. The visual design system emphasizes warmth through the signature terracotta palette while maintaining technical professionalism—reflecting Anthropic's brand positioning as both approachable and rigorous.

For developers building MCP integrations, the JSON-RPC 2.0 protocol with stdio/HTTP transport provides a standardized interface, while Desktop Extensions (.mcpb) simplify distribution. Enterprise administrators benefit from policy controls and managed deployment paths. The application remains in beta, suggesting continued evolution of both the interface and underlying capabilities.
