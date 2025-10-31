# AGI Workforce - Development Plan v3.0

**Document Version:** 3.0 (5-Month Lovable Displacement Plan)  
**Date:** 2025-10-28  
**Replaces:** v2.1 (90-day build)  
**Previous Version:** v1.0 (40-phase waterfall approach - DEPRECATED)  
**Timeline:** 150-day hypergrowth sprint to $100M ARR and Lovable displacement  
**Methodology:** AI pair-programming pods + GTM strike teams (Claude Max 20x, Codex Pro, Gemini Ultra, Perplexity Max)

**Change Log v3.0:**
- Reworked roadmap to hit Lovable parity by Day 45 and $100M ARR run-rate by Day 150
- Added dedicated Lovable displacement squad, migration tooling milestones, and marketplace launch
- Updated risk, staffing, and capital plans for 5-month hypergrowth
- Synced with PRD v4.0 hypergrowth revenue model and enterprise control plane scope

---

## Executive Summary

This development plan outlines the **5-month Lovable displacement strategy** to build AGI Workforce v1.0, migrate Lovable customers at scale, and reach a **$100M ARR run-rate by Day 150**. We deliver Lovable parity in 45 days, layer marketplace + Scale tier by Day 90, and unleash an enterprise displacement playbook that capitalizes on our **16 Modular Control Primitives (MCPs)**, deep Windows automation, and AI-assisted engineering velocity.

### Key Changes from v1.0 Plan:

**OLD (v1.0 - DEPRECATED):**
- 40 sequential phases
- Frontend-first waterfall approach
- "Phase 3.4: Custom Scrollbar Component" (task-level granularity)
- No realistic timeline estimates
- Financial projections misaligned with product scope

**NEW (v3.0 - CURRENT):**
- 18 feature-based milestones grouped into Lovable parity, marketplace, control plane, and hypergrowth phases
- Aggressive 150-day timeline aligned with $100M ARR plan and Lovable displacement targets
- Dedicated migration tooling, marketplace, and GTM strike-team milestones
- Risk mitigation, staffing, and capital model reworked for hypergrowth execution

### Timeline Overview (Lovable Displacement Sprints):

```
Phase 0 (Days 0-15):   Foundations + Lovable gap audit (Milestones 1-2)
Phase 1 (Days 16-45):  Lovable parity (Milestones 3-8)
Phase 2 (Days 46-75):  Marketplace + Scale tier (Milestones 9-12)
Phase 3 (Days 76-105): Enterprise control plane + migration automation (Milestones 13-16)
Phase 4 (Days 106-150): Hypergrowth polish + GTM acceleration (Milestones 17-18)

Day 45: Lovable parity GA
Day 90: Marketplace + Scale tier GA
Day 150: $100M ARR run-rate milestone
```

---

## Current Implementation Status (Audit – 2025-10-31)

| Milestone | Audit Status | Key Notes |
|-----------|--------------|-----------|
| M1 – Foundation & Infrastructure | ✅ ~95% complete | Tooling, database layer, and telemetry implemented; remaining work is automated test coverage and log rotation polish. |
| M2 – Core UI Shell | ✅ ~90% complete | Custom window controls, docking, theming, and system tray are live; smooth animation polish remains optional. |
| M3 – Chat Interface | ✅ ~85% complete | Chat flows, Zustand stores, markdown rendering, and attachments exist; continue refining virtualization edge cases. |
| M4 – LLM Router & Cost Tracking | ✅ ~90% complete | Multi-provider routing, caching, and dashboards operational; continue tuning cache hit analytics. |
| M5 – Windows Automation MCP | ✅ ~90% complete | UIA, input simulation, DXGI capture, OCR, and overlay ship; maintainability review pending. |
| M6 – Browser Automation MCP | ✅ ~85% complete | Playwright bridge and CDP client complete; extension packaging and QA automation remaining. |
| M7 – Code Editor MCP | 🟡 ~40% complete | Backend file APIs ready; Monaco editor, diff viewer, and tree UI still to wire up. |
| M8 – Terminal MCP | 🟡 ~60% complete | PTY backend and session management in place; xterm.js UI and multi-tab UX outstanding. |
| M9 – Filesystem MCP | ✅ ~95% complete | Explorer workspace, CRUD operations, and watchers done; finalize UI polish. |
| M10 – Database MCP | ✅ ~90% complete | SQL + NoSQL adapters with query builder ship; add final UX affordances and docs. |
| M11 – API MCP | ✅ ~90% complete | HTTP client, OAuth, templating, and response parsing done; expand saved request UX. |
| M12 – Communications MCP | 🟡 ~70% complete | IMAP/SMTP backend works; email inbox and composer UI still needed. |
| M13 – Calendar MCP | 🟡 ~60% complete | Google/Outlook integrations ready server-side; calendar visualization pending. |
| M14 – Productivity MCP | 🟡 ~70% complete | Notion/Trello/Asana integrations implemented; unified task UI incomplete. |
| M15 – Cloud Storage MCP | ✅ ~95% complete | Google Drive, Dropbox, OneDrive, and unified commands complete; ongoing QA. |
| M16 – Document MCP | 🔴 ~10% complete | Document parsing pipeline not yet implemented. |
| M17 – Mobile Companion MCP | 🔴 <5% complete | React Native/WebRTC stack not yet started beyond scaffolding. |
| M18 – Security & Polish | 🟡 ~50% complete | Keyring integration exists; guardrails, command palette, and accessibility still pending. |

---

## Development Principles

### 1. Feature-Driven Development
- Each milestone delivers a **complete, testable feature** (not just components)
- Users can **experience value** at the end of each milestone
- Example: Milestone 5 = "Windows Automation works end-to-end (user can click buttons via chat)"

### 2. Vertical Slice Architecture
- Every feature includes:
  - **Frontend:** UI components (React + Tailwind)
  - **Backend:** Rust commands (Tauri IPC handlers)
  - **Data:** SQLite schema + migrations
  - **Tests:** Unit tests (Rust), integration tests (Playwright)
  - **Docs:** Usage examples in README

### 3. Continuous Integration & Dogfooding
- **Daily builds:** Automated GitHub Actions on every commit
- **Internal testing:** Team uses the product starting at Milestone 2
- **Beta feedback:** Internal beta (20 users) at Day 45, Paid beta (50 users) at Day 60

### 4. AI-Accelerated Development
- **Tools:** Claude Max (20x usage), GitHub Codex Pro, Gemini Ultra, Perplexity Max
- **Target:** Complete all 16 MCPs in 3 months (90 days, 13 weeks)
- **Approach:** Sprint-driven, phase completion over timeline predictions
- **No scope cuts:** All 16 MCPs required for v1.0
- **PLG Enablement:** The 3-month sprint is specifically designed to enable rapid Product-Led Growth. By leveraging AI pair programming at 20x capacity, we compress what would traditionally be 18-24 months of development into a single quarter. This aggressive timeline is non-negotiable for the PLG motion: we need a complete, polished v1.0 in market quickly to start the viral adoption cycle and validate unit economics before scaling investment.

---

## Milestone Breakdown (18 Total)

---

## **MILESTONE 1: Foundation & Infrastructure**
**Sprint:** Foundation (AI-assisted, no fixed timeline)
**Status (2025-10-31 Audit):** ✅ 95% complete – finalize automated tests and log rotation polish.
**Approach:** Leverage AI tools for boilerplate generation

### Objectives:
- Set up development environment
- Configure all build tools and quality checks
- Establish database schema
- Create error handling and logging infrastructure

### Deliverables:

**1.1 Project Setup** ✅
- [x] pnpm workspace monorepo (`apps/`, `packages/`, `services/`)
- [x] TypeScript strict mode configuration
- [x] Vite with Tauri integration
- [x] ESLint + Prettier + Husky pre-commit hooks
- [x] Git workflow (main branch, conventional commits)

**1.2 Backend Foundation** ✅
- [x] Rust module structure (`router/`, `automation/`, `browser/`, `p2p/`, `db/`, etc.)
- [x] Cargo.toml with all dependencies (50+ crates)
- [x] Error types (`error.rs`) with `From` trait implementations
- [x] Utility functions (`utils.rs` for paths, formatters)

**1.3 Database Schema**
- [ ] SQLite database (`agiworkforce.db`)
- [ ] Tables:
  - `conversations` (id, title, created_at, updated_at)
  - `messages` (id, conversation_id, role, content, tokens, cost, created_at)
  - `settings` (key, value, encrypted)
  - `automation_history` (id, task_type, success, error, duration, cost)
  - `overlay_events` (id, event_type, x, y, data, timestamp)
- [ ] Migration system (rusqlite with versioning)

**1.4 Logging & Tracing**
- [ ] tracing-subscriber setup (JSON logs to `~/.agiworkforce/logs/`)
- [ ] Log rotation (7-day retention)
- [ ] Crash reporting integration (Sentry)

### Acceptance Criteria:
- ✅ `pnpm install` runs without errors
- ✅ `cargo build` compiles successfully
- [ ] `pnpm test` passes (when tests added)
- [ ] Database created on first run with all tables

### Risks:
- **Dependency conflicts:** Some crates may have version mismatches
  - **Mitigation:** Lock versions in Cargo.toml, use `cargo tree` to debug

---

## **MILESTONE 2: Core UI Shell**
**Sprint:** UI Shell (complete ASAP with AI assistance)
**Status (2025-10-31 Audit):** ✅ 90% complete – finalize animation polish and multi-monitor QA.
**Approach:** Use Codex Pro for React boilerplate, Claude Max for architecture decisions

### Objectives:
- Create the persistent sidebar window
- Implement custom title bar and system tray
- Build design system (Tailwind + component library)
- Set up window docking/undocking

### Deliverables:

**2.1 Main Window (Tauri)**
- [ ] Frameless window (360-480px width, 640-1080px height)
- [ ] Always-on-top toggle
- [ ] Window position persistence (SQLite: `window_state` table)
- [ ] Multi-monitor detection and placement
- [ ] Resize constraints (min/max width/height)

**2.2 Custom Title Bar (React)**
- [ ] Draggable title bar (Tauri `data-tauri-drag-region`)
- [ ] Close/Minimize/Maximize buttons
- [ ] Pin/Unpin button (toggle always-on-top)
- [ ] Smooth animations (framer-motion)

**2.3 System Tray**
- [ ] Tray icon (Windows notification area)
- [ ] Context menu:
  - Show/Hide window
  - New conversation
  - Settings
  - Quit
- [ ] Left-click to toggle window visibility
- [ ] Badge for unread notifications (future)

**2.4 Window Docking**
- [ ] Edge snapping detection (left/right screen edges)
- [ ] Magnetic snap within 20px of edge
- [ ] Docked state persistence
- [ ] Visual feedback (shadow, border highlight)

**2.5 Design System**
- [ ] Tailwind CSS configured (JIT mode)
- [ ] CSS variables for light/dark themes:
  ```css
  --background, --foreground
  --primary, --secondary, --accent
  --muted, --border, --ring
  ```
- [ ] Base components (Radix UI + custom styling):
  - Button (primary, secondary, ghost, link variants)
  - Input, TextArea
  - Select, Dropdown
  - Checkbox, Radio, Switch
  - Modal, Dialog
  - Tabs
  - Toast notifications (Sonner)
- [ ] Theme toggle (light/dark/system)

**2.6 Layout Structure**
- [ ] Sidebar layout with sections:
  - Title bar (fixed top)
  - Main content area (scrollable)
  - Footer/status bar (fixed bottom)
- [ ] Custom scrollbar styling

### Acceptance Criteria:
- [ ] Window persists position/size across app restarts
- [ ] Always-on-top works correctly
- [ ] System tray icon shows/hides window
- [ ] Window snaps to screen edges within 20px
- [ ] Theme toggle works, preference persists
- [ ] All base components render correctly in Storybook (if used)

### Risks:
- **Windows DPI scaling issues:** High-DPI displays may cause layout bugs
  - **Mitigation:** Test on 100%, 125%, 150%, 200% scaling

---

## **MILESTONE 3: Chat Interface**
**Sprint:** Days 1-10 (Sprint 1)
**Team:** 2 engineers (1 frontend, 1 Rust)
**Status (2025-10-31 Audit):** ✅ 85% complete – continue refining virtualization, file attachments, and UI polish.

### Objectives:
- Build the chat UI (message list, input composer)
- Implement conversation management
- Set up Zustand state management
- Create mock LLM responses (real routing in Milestone 4)

### Deliverables:

**3.1 State Management (Zustand)**
- [ ] `chatStore.ts`:
  - `conversations: Conversation[]`
  - `currentConversationId: string | null`
  - `messages: Message[]`
  - `sendMessage(content): Promise<void>`
  - `createConversation(): void`
  - `deleteConversation(id): void`
- [ ] `settingsStore.ts`:
  - `apiKeys: { openai, anthropic, google }`
  - `routerRules: RouterRule[]`
  - `theme: 'light' | 'dark' | 'system'`
- [ ] Persist middleware (localStorage for settings, SQLite for messages)

**3.2 Message List Component**
- [ ] Virtual scrolling (react-window) for 1000+ messages
- [ ] Message grouping by date ("Today", "Yesterday", "Jan 25")
- [ ] User vs. AI message styling (different backgrounds)
- [ ] Markdown rendering (react-markdown):
  - Bold, italic, links, code blocks
  - Syntax highlighting (highlight.js)
  - Math rendering (rehype-katex)
- [ ] Code block features:
  - Language detection
  - Copy button
  - Line numbers
- [ ] Message actions menu (hover):
  - Copy message
  - Regenerate response
  - Edit message
  - Delete message
- [ ] Scroll-to-bottom button (appears when not at bottom)
- [ ] Unread indicator

**3.3 Input Composer**
- [ ] Auto-expanding textarea (1-10 lines)
- [ ] Shift+Enter for newline, Enter to send
- [ ] File attachment UI (drag-drop + file picker)
- [ ] Model selector dropdown (OpenAI GPT-4, Claude, Gemini, Ollama)
- [ ] Character/token counter
- [ ] Send button with loading spinner
- [ ] Disabled state while waiting for response

**3.4 Conversation Sidebar**
- [ ] Conversation list (collapsible sidebar or separate view)
- [ ] New conversation button
- [ ] Conversation search (filter by title/content)
- [ ] Pin favorite conversations
- [ ] Delete with confirmation dialog
- [ ] Rename conversation (inline edit)

**3.5 Backend Commands (Mock)**
- [ ] `chat_send_message(content, conversation_id)` → returns mock response
- [ ] `chat_get_messages(conversation_id)` → loads from SQLite
- [ ] `chat_create_conversation()` → inserts into DB
- [ ] `chat_delete_conversation(id)` → soft delete (mark as archived)

### Acceptance Criteria:
- [ ] Can create new conversations
- [ ] Messages render with markdown and code highlighting
- [ ] Conversations persist across app restarts
- [ ] Virtual scrolling handles 1000+ messages without lag
- [ ] File attachment UI shows selected files (actual upload in Milestone 4)

### Risks:
- **Virtual scrolling complexity:** May be buggy with dynamic message heights
  - **Mitigation:** Use `react-virtualized-auto-sizer` for height calculation

---

## **MILESTONE 4: LLM Router & Cost Tracking**
**Sprint:** Days 1-10 (Sprint 1)
**Team:** 2 engineers (1 backend-focused, 1 frontend for dashboard)
**Status (2025-10-31 Audit):** ✅ 90% complete – continue cache hit tuning and streaming QA.

### Objectives:
- Integrate real LLM providers (OpenAI, Anthropic, Google, Ollama)
- Build intelligent router (task type → model selection)
- Implement cost tracking (tokens, pricing per provider)
- Create real-time cost dashboard

### Deliverables:

- **4.1 Provider Implementations (Rust)**
- [x] `providers/openai.rs`:
  - Support GPT-4o, GPT-4o-mini, o1, o1-mini
  - Streaming responses
  - Token counting (tiktoken port or API response)
- [x] `providers/anthropic.rs`:
  - Support Claude 3.5 Sonnet, 3.5 Haiku, 3 Opus
  - Streaming responses
  - Anthropic's token counting
- [x] `providers/google.rs`:
  - Support Gemini 1.5 Pro, Flash
  - Streaming responses
  - Google's token counting
- [x] `providers/ollama.rs`:
  - Support local models (Llama 3.1, Mistral, Gemma)
  - No token counting (free)
- [x] Unified `Provider` trait:
  ```rust
  trait Provider {
      async fn send_message(&self, messages: Vec<Message>) -> Result<Response>;
      fn count_tokens(&self, text: &str) -> usize;
      fn get_pricing(&self, model: &str) -> Pricing;
  }
  ```

- **4.2 LLM Router (Rust)**
- [x] `router/llm_router.rs`:
  - Task classification:
    - Simple (chat, follow-up) → cheapest model (GPT-4o-mini, Haiku)
    - Complex (code generation, reasoning) → smart model (GPT-4o, Sonnet)
    - Creative (brainstorming, writing) → versatile model (Gemini Pro)
  - Routing rules:
    - User preference (manual model selection)
    - Cost optimization (cheapest capable model)
    - Latency optimization (fastest model)
    - Local-first (Ollama if available)
  - Fallback chain:
    - Primary model fails → try fallback model
    - All remote models fail → return error (don't infinite loop)

- **4.3 Cost Calculator (Rust)**
- [x] `router/cost_calculator.rs`:
  - Pricing table (updated monthly):
    ```rust
    const PRICING: &[(Provider, Model, InputCost, OutputCost)] = &[
        ("openai", "gpt-4o", 2.50, 10.00),        // per 1M tokens
        ("openai", "gpt-4o-mini", 0.15, 0.60),
        ("anthropic", "claude-3.5-sonnet", 3.00, 15.00),
        // ...
    ];
    ```
  - Calculate cost per message:
    - `cost = (input_tokens * input_cost + output_tokens * output_cost) / 1_000_000`
  - Store in SQLite `messages` table
  - Aggregate cost by:
    - Conversation
    - Provider
    - Model
    - Time period (day, week, month)

- **4.4 Caching (Rust)**
- [x] `router/cache_manager.rs`:
  - Cache key: `hash(messages, model)` (SHA-256)
  - Cache storage: SQLite table `cache_entries`
  - TTL: 24 hours
  - Eviction: LRU (least recently used)
  - Cache hit → return cached response, cost = $0

- **4.5 Cost Dashboard (React)**
- [x] Real-time cost widget (top of chat sidebar):
  - Today's spend: $X.XX
  - This month's spend: $X.XX
  - Remaining budget: $X.XX (if set)
- [x] Detailed cost breakdown page:
  - Line chart (Recharts): Cost over time (last 30 days)
  - Pie chart: Cost by provider
  - Table: Top 10 most expensive conversations
  - Filters: Date range, provider, model

- **4.6 Backend Integration**
- [x] `chat_send_message` now calls real LLM:
  - Parse user message
  - Route to appropriate provider/model
  - Stream response chunks via WebSocket
  - Calculate cost
  - Store in SQLite
  - Update frontend cost dashboard

### Acceptance Criteria:
- [ ] Can send message and receive real LLM response
- [ ] Router selects appropriate model based on task
- [ ] Cost is calculated correctly and displayed in dashboard
- [ ] Cache hit rate >20% after 100 messages (test with repeated questions)
- [ ] Streaming responses work smoothly (no UI freezing)

### Risks:
- **API rate limits:** OpenAI may throttle during testing
  - **Mitigation:** Use API keys with higher limits, implement retry with backoff
- **Token counting inaccuracy:** May under/over-estimate costs
  - **Mitigation:** Use provider's official token counting APIs where available

---

## **MILESTONE 5: Windows Automation MCP**
**Sprint:** Days 11-25 (Sprint 2)
**Team:** 2 engineers (1 Rust Windows expert, 1 frontend for overlay)
**Status (2025-10-31 Audit):** ✅ 90% complete – overlay QA and maintainability review outstanding.

### Objectives:
- Implement UI Automation (UIA) for Windows desktop control
- Build input simulation (keyboard, mouse, clipboard)
- Create screen capture (DXGI) with OCR
- Implement overlay visualization system

### Deliverables:

**5.1 UI Automation Integration (Rust + windows-rs)**
- [ ] `automation/uia/element_tree.rs`:
  - Find window by title/class name
  - Traverse element tree (breadth-first search)
  - Query element properties (name, className, controlType, boundingRectangle)
- [ ] `automation/uia/patterns.rs`:
  - InvokePattern (click buttons)
  - ValuePattern (get/set text in inputs)
  - SelectionPattern (select dropdown items)
  - TogglePattern (check/uncheck checkboxes)
  - TextPattern (get text content)
- [ ] `automation/uia/actions.rs`:
  - `click_element(handle)` → invoke click
  - `type_text(handle, text)` → set value
  - `get_text(handle)` → read value
  - `select_option(handle, value)` → select from dropdown

**5.2 Input Simulation (Rust + windows-rs)**
- [ ] `automation/input/keyboard.rs`:
  - `send_keys(text)` → simulates typing (supports modifiers: Ctrl, Alt, Shift)
  - `press_key(vk_code)` → single key press
  - `hotkey(modifiers, key)` → e.g., Ctrl+C
- [ ] `automation/input/mouse.rs`:
  - `move_to(x, y)` → absolute screen coordinates
  - `click(x, y, button)` → left/right/middle click
  - `drag(x1, y1, x2, y2)` → click-drag-release
  - `scroll(delta)` → mouse wheel
- [ ] `automation/input/clipboard.rs`:
  - `get_clipboard()` → read clipboard text
  - `set_clipboard(text)` → write to clipboard

**5.3 Screen Capture (Rust + DXGI)**
- [ ] `automation/screen/capture.rs`:
  - `capture_screen()` → full screen screenshot (DXGI duplicate output)
  - `capture_region(x, y, width, height)` → specific area
  - Save as PNG to temp directory
  - Return file path for frontend display
- [ ] `automation/screen/dxgi.rs`:
  - Initialize DXGI (Direct3D 11)
  - Duplicate desktop output
  - Convert to CPU-accessible texture
  - Convert to PNG via `image` crate

**5.4 OCR Integration (Optional Feature Flag)**
- [ ] `automation/screen/ocr.rs`:
  - Tesseract wrapper (compile with `ocr` feature)
  - `ocr_image(path)` → extract text from screenshot
  - Return bounding boxes + confidence scores

**5.5 Overlay Visualization (Rust + Tauri)**
- [ ] `overlay/window.rs`:
  - Create transparent, always-on-top window
  - WS_EX_LAYERED | WS_EX_TRANSPARENT (click-through)
  - Full-screen size (match monitor resolution)
  - Handle multi-monitor setups
- [ ] `overlay/renderer.rs` (Frontend - React Canvas):
  - Canvas 2D API rendering
  - 60 fps rendering loop (requestAnimationFrame)
  - Event-driven (only render when effects active)
- [ ] `overlay/animations.rs` (Frontend):
  - Click ripple effect:
    - Expanding circle (200ms duration)
    - Fade out (opacity 1.0 → 0.0)
    - Color by button (left=blue, right=red, middle=green)
  - Typing caret:
    - Blinking vertical line at cursor position
    - Character reveal animation
  - Region highlight:
    - Marching ants border (dashed border animation)
    - Semi-transparent fill
  - Screenshot flash:
    - White full-screen flash (100ms)
    - Fade out

**5.6 Backend Commands**
- [ ] `automation_click(selector, x, y)`
- [ ] `automation_type(selector, text)`
- [ ] `automation_get_text(selector)` → string
- [ ] `automation_screenshot(x, y, width, height)` → file path
- [ ] `automation_ocr(image_path)` → text (if OCR enabled)
- [ ] `overlay_emit_click(x, y, button)`
- [ ] `overlay_emit_type(x, y, text)`
- [ ] `overlay_emit_region(x, y, width, height)`

### Acceptance Criteria:
- [ ] Can click a button in Notepad via chat command
- [ ] Can type text into Notepad via chat command
- [ ] Screenshot captures correctly on 1080p and 4K monitors
- [ ] Overlay effects render smoothly (60 fps, no flicker)
- [ ] Replay system can replay recorded actions

### Risks:
- **UI Automation flakiness:** Some apps don't expose UIA elements properly
  - **Mitigation:** Fallback to image recognition (OpenCV template matching)
- **DXGI performance:** Screen capture may be slow on older GPUs
  - **Mitigation:** Cache screenshots, only capture on demand

---

## **MILESTONE 6: Browser Automation MCP**
**Sprint:** Days 11-25 (Sprint 2)
**Team:** 2 engineers (1 Rust for Playwright bridge, 1 TypeScript for extension)
**Status (2025-10-31 Audit):** ✅ 85% complete – package extension and broaden QA automation.

### Objectives:
- Integrate Playwright for cross-browser automation
- Build browser extension for deep DOM access
- Implement tab management and session persistence
- Create web scraping and form filling capabilities

### Deliverables:

**6.1 Playwright Bridge (Rust + Node.js)**
- [ ] `browser/playwright_bridge.rs`:
  - Spawn Playwright server (Node.js subprocess)
  - WebSocket communication (Rust ↔ Playwright)
  - Supported browsers: Chromium, Firefox, WebKit
  - Launch browser with options:
    - Headless vs. headed
    - User data directory (persistent sessions)
    - Extensions enabled
    - Proxy configuration

**6.2 Browser Operations**
- [ ] `browser/tab_manager.rs`:
  - `open_tab(url)` → new tab
  - `close_tab(id)` → close tab
  - `switch_tab(id)` → bring tab to front
  - `list_tabs()` → all open tabs
  - `get_tab_screenshot(id)` → PNG screenshot
- [ ] DOM interaction:
  - `click(selector)` → click element
  - `type(selector, text)` → type into input
  - `select(selector, value)` → select dropdown option
  - `get_text(selector)` → extract text
  - `get_attribute(selector, attr)` → get attribute value
  - `wait_for(selector, timeout)` → wait for element
- [ ] Navigation:
  - `goto(url)` → navigate to URL
  - `go_back()`, `go_forward()`, `reload()`
  - `wait_for_navigation()` → wait for page load

**6.3 Browser Extension (Chrome/Edge)**
- [ ] Manifest V3 extension:
  - Permissions: `activeTab`, `tabs`, `storage`, `webNavigation`
  - Content script: Inject into all pages
  - Background service worker: Handle messages from AGI Workforce
- [ ] Features:
  - Deep DOM access (bypass Playwright limitations)
  - Screenshot capture (higher quality than Playwright)
  - Cookie extraction
  - Local storage access
  - Popup UI: "AGI Workforce is controlling this page"

**6.4 Session Management**
- [ ] User data persistence:
  - Save cookies to SQLite
  - Save local storage to SQLite
  - Reuse same browser profile across sessions
- [ ] Authentication:
  - Detect login pages
  - Store credentials securely (OS keyring)
  - Auto-fill login forms

**6.5 Web Scraping**
- [ ] `scrape_table(selector)` → extract HTML table to JSON
- [ ] `scrape_list(selector)` → extract list items
- [ ] `scrape_links(filter)` → extract all links matching pattern
- [ ] Handle pagination:
  - Click "Next" button
  - Scroll to load more (infinite scroll)

**6.6 Backend Commands**
- [ ] `browser_open(url, browser_type)`
- [ ] `browser_click(selector)`
- [ ] `browser_type(selector, text)`
- [ ] `browser_screenshot()` → file path
- [ ] `browser_scrape(selector, type)` → JSON

### Acceptance Criteria:
- [ ] Can open Google, search for "AGI Workforce", click first result
- [ ] Can fill out a web form (e.g., login to Gmail)
- [ ] Screenshots work correctly
- [ ] Sessions persist (don't need to log in again)
- [ ] Works on Chromium and Firefox

### Risks:
- **Playwright overhead:** Node.js subprocess adds ~200MB memory
  - **Mitigation:** Only launch browser when needed, kill after idle timeout
- **Extension rejection:** Chrome Web Store may reject extension
  - **Mitigation:** Distribute as unpacked extension (dev mode) for v1.0

---

## **MILESTONE 7: Code Editor MCP**
**Sprint:** Days 26-35 (Sprint 3)
**Team:** 1 engineer (frontend-focused)
**Status (2025-10-31 Audit):** 🟡 40% complete – Monaco editor, diff viewer, and file tree UI outstanding.

### Objectives:
- Integrate Monaco Editor (VS Code editor component)
- Build file tree navigation
- Implement multi-tab editing with diff viewer
- Add language services (TypeScript, Python, Rust, etc.)

### Deliverables:

**7.1 Monaco Editor Integration**
- [ ] Install `@monaco-editor/react`
- [ ] Configure editor options:
  - Theme: Match app theme (light/dark)
  - Font: Fira Code or JetBrains Mono (ligatures enabled)
  - Line numbers, minimap, bracket matching
  - Auto-save on blur (debounced)
- [ ] Language support:
  - TypeScript, JavaScript, Python, Rust, Go, Java, C#, JSON, YAML, Markdown, SQL

**7.2 File Tree Component**
- [ ] `FileExplorer.tsx`:
  - Tree view (react-arborist or custom)
  - Folder collapse/expand
  - File icons (VS Code icons)
  - Context menu:
    - New file/folder
    - Rename
    - Delete (with confirmation)
    - Copy/paste
  - Search in files (fuzzy search)

**7.3 Tab Management**
- [ ] `TabManager.tsx`:
  - Tab bar above editor
  - Close button on each tab
  - Unsaved indicator (dot on tab)
  - Close all/close others
  - Drag to reorder tabs
  - Ctrl+1-9 to switch tabs

**7.4 Diff Viewer**
- [ ] Side-by-side diff (Monaco Diff Editor)
- [ ] Accept/reject hunks (inline buttons)
- [ ] Unified diff view option
- [ ] Syntax highlighting in diffs

**7.5 Backend File Commands**
- [ ] `file_read(path)` → content
- [ ] `file_write(path, content)` → success
- [ ] `file_list(directory)` → file tree
- [ ] `file_delete(path)` → success
- [ ] `file_rename(old_path, new_path)` → success
- [ ] `file_watch(path)` → stream of change events (via Tauri event system)

### Acceptance Criteria:
- [ ] Can open project folder and see file tree
- [ ] Can edit files with syntax highlighting
- [ ] Unsaved changes are indicated
- [ ] Tabs persist across app restarts
- [ ] File watcher updates tree when files change externally

### Risks:
- **Monaco bundle size:** Editor adds ~5MB to bundle
  - **Mitigation:** Code-split Monaco (load on demand)

---

## **MILESTONE 8: Terminal MCP**
**Sprint:** Days 26-35 (Sprint 3)
**Team:** 1 engineer (Rust + frontend)
**Status (2025-10-31 Audit):** 🟡 60% complete – xterm.js UI, terminal tabs, and persistence outstanding.

### Objectives:
- Implement PTY (pseudo-terminal) integration
- Support multiple shells (PowerShell, CMD, WSL, Git Bash)
- Build xterm.js UI with addons
- Create session management (multiple terminals)

### Deliverables:

**8.1 PTY Integration (Rust)**
- [ ] Install `portable-pty` crate
- [ ] `terminal/pty.rs`:
  - Spawn shell process (PowerShell by default on Windows)
  - Detect available shells:
    - PowerShell: `powershell.exe`, `pwsh.exe`
    - CMD: `cmd.exe`
    - WSL: `wsl.exe`
    - Git Bash: `C:\Program Files\Git\bin\bash.exe`
  - Stream stdout/stderr to frontend (WebSocket)
  - Send stdin from frontend
  - Handle resize events (cols, rows)

**8.2 Terminal UI (xterm.js)**
- [ ] Install `@xterm/xterm` and addons:
  - `@xterm/addon-fit` (auto-resize to container)
  - `@xterm/addon-search` (Ctrl+F to search output)
  - `@xterm/addon-web-links` (clickable URLs)
  - `@xterm/addon-webgl` (GPU-accelerated rendering)
- [ ] `XTerminal.tsx`:
  - Terminal instance per session
  - Theme matching (light/dark)
  - Font: Consolas or Cascadia Code
  - Cursor blinking
  - Clipboard support (Ctrl+Shift+C/V)

**8.3 Session Management**
- [ ] `TerminalTabs.tsx`:
  - Tab bar for multiple terminals
  - New terminal button (+)
  - Close terminal (with confirmation if process running)
  - Session persistence (save CWD and shell type)
- [ ] `CommandHistory.tsx`:
  - Store last 1000 commands in SQLite
  - Autocomplete from history (Up/Down arrows handled by shell)

**8.4 Terminal Features**
- [ ] Link detection (URLs, file paths)
  - Click to open in browser or file explorer
- [ ] Search in output (Ctrl+F)
- [ ] Clear terminal (Ctrl+K)
- [ ] Context menu:
  - Copy
  - Paste
  - Select all
  - Clear scrollback

**8.5 Backend Commands**
- [ ] `terminal_create(shell_type)` → session_id
- [ ] `terminal_send_input(session_id, data)`
- [ ] `terminal_resize(session_id, cols, rows)`
- [ ] `terminal_kill(session_id)`

### Acceptance Criteria:
- [ ] Can open PowerShell and run commands
- [ ] Output streams in real-time (no lag)
- [ ] Can resize terminal, text reflows correctly
- [ ] Multiple terminals work simultaneously
- [ ] Sessions survive app restart (restore CWD)

### Risks:
- **PTY encoding issues:** Non-ASCII characters may render incorrectly
  - **Mitigation:** Use UTF-8 encoding, test with emoji/unicode

---

## **MILESTONE 9: Filesystem MCP**
**Sprint:** Days 36-50 (Sprint 4)
**Team:** 1 engineer (Rust)
**Status (2025-10-31 Audit):** ✅ 95% complete – UI polish and documentation updates remain.

### Objectives:
- Implement file CRUD operations
- Build directory traversal with glob patterns
- Create file watching for real-time updates
- Add permission management and sandboxing

### Deliverables:

**9.1 File Operations**
- [ ] `filesystem/crud.rs`:
  - `read_file(path)` → content (text or base64 for binary)
  - `write_file(path, content)` → success
  - `delete_file(path)` → success
  - `rename_file(old, new)` → success
  - `copy_file(src, dest)` → success
  - `move_file(src, dest)` → success

**9.2 Directory Operations**
- [ ] `filesystem/directory.rs`:
  - `list_directory(path)` → files + folders
  - `create_directory(path)` → success
  - `delete_directory(path, recursive)` → success
  - `traverse(path, glob_pattern)` → matching files (use `glob` crate)

**9.3 File Watching**
- [ ] `filesystem/watcher.rs`:
  - Use `notify` crate (cross-platform)
  - Watch directory for changes
  - Emit events via Tauri event system:
    - `file_created`, `file_modified`, `file_deleted`, `file_renamed`
  - Frontend updates file tree in real-time

**9.4 Permissions & Sandboxing**
- [ ] `filesystem/permissions.rs`:
  - Whitelist allowed directories (user selects via file picker)
  - Blacklist sensitive directories:
    - `C:\Windows\System32`
    - `C:\Program Files`
    - `~/.ssh`
  - Confirm dangerous operations:
    - Delete 10+ files → show confirmation dialog
    - Write to system directories → show warning

**9.5 Backend Commands**
- [ ] `filesystem_read(path)` → content
- [ ] `filesystem_write(path, content)` → success
- [ ] `filesystem_list(path)` → tree
- [ ] `filesystem_delete(path)` → success
- [ ] `filesystem_watch(path)` → start watcher

### Acceptance Criteria:
- [ ] Can read/write files
- [ ] File tree updates when files change externally
- [ ] Cannot delete system directories without confirmation
- [ ] Glob patterns work (e.g., `**/*.ts` finds all TS files)

### Risks:
- **Permission errors:** User may not have write access to certain folders
  - **Mitigation:** Show clear error messages, suggest running as admin

---

## **MILESTONE 10: Database MCP**
**Sprint:** Days 36-50 (Sprint 4)
**Team:** 1 engineer (Rust)
**Status (2025-10-31 Audit):** ✅ 90% complete – extend query UX, connection tooling, and docs.

### Objectives:
- Support SQL databases (PostgreSQL, MySQL, SQLite)
- Support NoSQL databases (MongoDB, Redis)
- Build query builder with syntax highlighting
- Implement connection pooling and retry logic

### Deliverables:

**10.1 SQL Support**
- [ ] PostgreSQL (via `tokio-postgres`)
- [ ] MySQL (via `mysql_async`)
- [ ] SQLite (via `rusqlite`)
- [ ] Unified interface:
  ```rust
  trait Database {
      async fn execute(&self, query: &str) -> Result<Vec<Row>>;
      async fn query(&self, query: &str) -> Result<Vec<Row>>;
      fn test_connection(&self) -> Result<bool>;
  }
  ```

**10.2 NoSQL Support**
- [ ] MongoDB (via `mongodb`)
- [ ] Redis (via `redis-rs`)
- [ ] Operations:
  - MongoDB: find, insert, update, delete, aggregate
  - Redis: get, set, del, hset, hgetall, lpush, rpush

**10.3 Connection Management**
- [ ] Connection pooling (max 10 connections per database)
- [ ] Retry logic (exponential backoff for transient errors)
- [ ] Connection persistence (save credentials in OS keyring)

**10.4 Query Builder (Frontend)**
- [ ] SQL editor with Monaco (SQL syntax highlighting)
- [ ] Autocomplete (table names, column names)
- [ ] Query history (last 100 queries)
- [ ] Execute button (Ctrl+Enter)
- [ ] Results table:
  - Paginated (100 rows per page)
  - Sortable columns
  - Export to CSV/JSON

**10.5 Backend Commands**
- [ ] `database_connect(type, host, port, user, password, db)` → connection_id
- [ ] `database_execute(connection_id, query)` → rows
- [ ] `database_disconnect(connection_id)` → success

### Acceptance Criteria:
- [ ] Can connect to PostgreSQL, run SELECT query, see results
- [ ] Can insert/update/delete rows
- [ ] Query history persists
- [ ] Connection pooling works (10 concurrent queries don't create 10 connections)

### Risks:
- **Connection errors:** Firewalls may block database ports
  - **Mitigation:** Show detailed error messages (connection refused, timeout, auth failed)

---

## **MILESTONE 11: API MCP**
**Sprint:** Days 36-50 (Sprint 4)
**Team:** 1 engineer (Rust)
**Status (2025-10-31 Audit):** ✅ 90% complete – expand saved request UX and documentation.

### Objectives:
- HTTP client with OAuth 2.0, API key, and Bearer token auth
- Request templating with variable substitution
- Automatic retry with exponential backoff
- Response parsing (JSON, XML, HTML)

### Deliverables:

**11.1 HTTP Client**
- [ ] Use `reqwest` with `reqwest-middleware` and `reqwest-retry`
- [ ] Supported methods: GET, POST, PUT, PATCH, DELETE, HEAD
- [ ] Headers:
  - Custom headers (user-defined)
  - User-Agent: "AGI Workforce v1.0"
  - Content-Type: application/json (default)
- [ ] Body:
  - JSON (automatic serialization)
  - Form data (multipart/form-data)
  - Raw text

**11.2 Authentication**
- [ ] API Key:
  - Header: `X-API-Key: <key>`
  - Query param: `?api_key=<key>`
- [ ] Bearer Token:
  - Header: `Authorization: Bearer <token>`
- [ ] OAuth 2.0:
  - Authorization Code Flow
  - PKCE support
  - Token refresh (store in SQLite)

**11.3 Request Templating**
- [ ] Variable substitution:
  - `{{variable_name}}` in URL, headers, body
  - Variables from:
    - Environment variables
    - SQLite settings
    - Previous response (e.g., `{{response.data.id}}`)

**11.4 Response Handling**
- [ ] Parse JSON → structured data
- [ ] Parse XML → structured data (via `quick-xml`)
- [ ] Parse HTML → DOM (via `scraper`)
- [ ] Status code handling:
  - 2xx → success
  - 4xx → client error (show message)
  - 5xx → server error (retry)
  - Timeout → retry

**11.5 Backend Commands**
- [ ] `api_request(method, url, headers, body, auth)` → response
- [ ] `api_oauth_login(provider)` → auth_url (user opens in browser)
- [ ] `api_oauth_callback(code)` → access_token (store in SQLite)

### Acceptance Criteria:
- [ ] Can call OpenWeather API, get JSON response, display weather
- [ ] Can authenticate with GitHub API (OAuth), list user repos
- [ ] Retry works for 503 errors

### Risks:
- **OAuth complexity:** Authorization Code Flow requires web server
  - **Mitigation:** Use localhost redirect (http://localhost:8080/callback)

---

## **MILESTONE 12: Communications MCP**
**Sprint:** Days 51-65 (Sprint 5)
**Team:** 1 engineer (Rust)
**Status (2025-10-31 Audit):** 🟡 70% complete – build inbox/composer UI and finish OAuth UX.

### Objectives:
- IMAP client (Gmail, Outlook, custom servers)
- SMTP client for sending emails
- Email parsing (MIME, attachments, inline images)
- Contact management with vCard support

### Deliverables:

**12.1 IMAP Client**
- [ ] Use `async-imap` crate
- [ ] Connect to server (SSL/TLS)
- [ ] Authenticate (username/password or OAuth)
- [ ] List folders (INBOX, Sent, Drafts, etc.)
- [ ] Fetch emails:
  - Unread only
  - Date range
  - From/To filter
  - Subject/body search
- [ ] Mark as read/unread
- [ ] Delete emails (move to Trash)

**12.2 SMTP Client**
- [ ] Use `lettre` crate
- [ ] Send email:
  - To, CC, BCC
  - Subject, body (plain text or HTML)
  - Attachments
  - Reply-To header
- [ ] Authentication (SMTP AUTH)

**12.3 Email Parsing**
- [ ] Parse MIME multipart messages
- [ ] Extract attachments (save to temp directory)
- [ ] Extract inline images (data URLs)
- [ ] Parse HTML emails (render in iframe with CSP)

**12.4 Contact Management**
- [ ] Store contacts in SQLite (`contacts` table)
- [ ] Import from vCard (.vcf files)
- [ ] Export to vCard
- [ ] Autocomplete in "To" field

**12.5 Backend Commands**
- [ ] `email_connect(provider, email, password)` → account_id
- [ ] `email_fetch_inbox(account_id, limit)` → emails
- [ ] `email_send(account_id, to, subject, body, attachments)` → success
- [ ] `email_mark_read(account_id, email_id)` → success

### Acceptance Criteria:
- [ ] Can connect to Gmail via IMAP, fetch unread emails
- [ ] Can send email via SMTP
- [ ] Attachments download correctly
- [ ] HTML emails render safely (no XSS)

### Risks:
- **Gmail app passwords:** Gmail requires app-specific passwords
  - **Mitigation:** Show clear instructions on how to generate app password

---

## **MILESTONE 13: Calendar MCP**
**Sprint:** Days 51-65 (Sprint 5)
**Team:** 1 engineer (Rust)
**Status (2025-10-31 Audit):** 🟡 60% complete – calendar UI, notifications, and time-zone polish outstanding.

### Objectives:
- Google Calendar API integration
- Microsoft Outlook Calendar API
- Event CRUD (create, read, update, delete)
- Reminder notifications and time zone handling

### Deliverables:

**13.1 Google Calendar**
- [ ] OAuth 2.0 authentication
- [ ] List calendars
- [ ] List events (date range filter)
- [ ] Create event (title, start/end time, location, attendees)
- [ ] Update event
- [ ] Delete event
- [ ] Reminder notifications (desktop notification)

**13.2 Microsoft Outlook Calendar**
- [ ] OAuth 2.0 authentication (Microsoft Graph API)
- [ ] List calendars
- [ ] List events
- [ ] CRUD operations

**13.3 Time Zone Handling**
- [ ] Use `chrono-tz` crate
- [ ] Convert event times to user's local time zone
- [ ] Display time zone in UI

**13.4 Backend Commands**
- [ ] `calendar_connect(provider)` → account_id
- [ ] `calendar_list_events(account_id, start, end)` → events
- [ ] `calendar_create_event(account_id, event)` → event_id
- [ ] `calendar_update_event(account_id, event_id, event)` → success
- [ ] `calendar_delete_event(account_id, event_id)` → success

### Acceptance Criteria:
- [ ] Can view Google Calendar events
- [ ] Can create new event, it appears in Google Calendar web
- [ ] Time zones display correctly

### Risks:
- **OAuth setup:** Requires creating Google Cloud project
  - **Mitigation:** Provide step-by-step guide in docs

---

## **MILESTONE 14: Productivity MCP**
**Sprint:** Days 51-65 (Sprint 5)
**Team:** 1 engineer (Rust)
**Status (2025-10-31 Audit):** 🟡 70% complete – unify task interface and finish front-end surfaces.

### Objectives:
- Notion API (pages, databases, blocks)
- Trello API (boards, lists, cards)
- Asana API (projects, tasks, subtasks)
- Unified interface for cross-platform task management

### Deliverables:

**14.1 Notion Integration**
- [ ] OAuth 2.0 or integration token
- [ ] List pages
- [ ] Get page content (blocks)
- [ ] Create page
- [ ] Query database (filter, sort)
- [ ] Create database row

**14.2 Trello Integration**
- [ ] API key + token auth
- [ ] List boards
- [ ] List cards in board/list
- [ ] Create card
- [ ] Move card to different list
- [ ] Add comment to card

**14.3 Asana Integration**
- [ ] OAuth 2.0 or personal access token
- [ ] List projects
- [ ] List tasks in project
- [ ] Create task
- [ ] Assign task
- [ ] Mark task complete

**14.4 Unified Task Interface**
- [ ] Abstract model:
  ```rust
  struct Task {
      id: String,
      title: String,
      description: String,
      status: TaskStatus,
      due_date: Option<DateTime<Utc>>,
      assignee: Option<String>,
  }
  ```
- [ ] Convert between providers

**14.5 Backend Commands**
- [ ] `productivity_connect(provider)` → account_id
- [ ] `productivity_list_tasks(account_id)` → tasks
- [ ] `productivity_create_task(account_id, task)` → task_id

### Acceptance Criteria:
- [ ] Can list Notion databases, create row
- [ ] Can create Trello card
- [ ] Can list Asana tasks

### Risks:
- **API rate limits:** Notion has strict rate limits (3 req/sec)
  - **Mitigation:** Implement rate limiting, queue requests

---

## **MILESTONE 15: Cloud Storage MCP**
**Sprint:** Days 66-75 (Sprint 6)
**Team:** 1 engineer (Rust)
**Status (2025-10-31 Audit):** ✅ 95% complete – continue provider QA and sharing UX refinement.

### Objectives:
- Google Drive API (upload, download, search, share)
- Dropbox API (files, folders, team folders)
- Microsoft OneDrive API (Microsoft Graph)
- Unified file operations across all providers

### Deliverables:

**15.1 Google Drive**
- [x] OAuth 2.0 authentication
- [x] List files/folders
- [x] Upload file
- [x] Download file
- [x] Create folder
- [x] Share file (get public link)
- [x] Search files (by name, MIME type, modified date)

**15.2 Dropbox**
- [x] OAuth 2.0 authentication
- [x] Upload file (chunked upload for large files)
- [x] Download file
- [x] List folder contents
- [x] Create shared link

**15.3 OneDrive**
- [x] OAuth 2.0 authentication (Microsoft Graph)
- [x] Upload file
- [x] Download file
- [x] List drive contents
- [x] Share file

**15.4 Unified Interface**
- [x] Abstract operations:
  - `upload(provider, local_path, remote_path)`
  - `download(provider, remote_path, local_path)`
  - `list(provider, folder_path)` → files
  - `delete(provider, path)`

**15.5 Backend Commands**
- [x] `cloud_connect(provider)` -> account_id
- [x] `cloud_upload(account_id, local_path, remote_path)` -> file_id
- [x] `cloud_download(account_id, remote_path, local_path)` -> success
- [x] `cloud_list(account_id, folder_path)` -> files

### Acceptance Criteria:
- [x] Can upload file to Google Drive
- [x] Can download file from Dropbox
- [x] Can list OneDrive contents

### Risks:
- **Upload timeouts:** Large files (1GB+) may timeout
  - **Mitigation:** Implement resumable uploads

---

## **MILESTONE 16: Document MCP**
**Sprint:** Days 66-75 (Sprint 6)
**Team:** 1 engineer (Rust)
**Status (2025-10-31 Audit):** 🔴 10% complete – document parsing and conversion pipeline not yet implemented.

### Objectives:
- PDF parsing (text extraction, page manipulation)
- Office document parsing (DOCX, XLSX, PPTX via LibreOffice)
- Markdown rendering and export
- Document format conversion pipeline

### Deliverables:

**16.1 PDF Parsing**
- [ ] Use `pdf` crate or `pdfium-render`
- [ ] Extract text from PDF
- [ ] Extract images from PDF
- [ ] Split PDF (extract specific pages)
- [ ] Merge PDFs
- [ ] Add watermark

**16.2 Office Document Parsing**
- [ ] DOCX: Use `docx-rs` or `serde-docx`
- [ ] XLSX: Use `calamine`
- [ ] PPTX: Use LibreOffice CLI (`soffice --headless --convert-to pdf`)

**16.3 Markdown**
- [ ] Render markdown to HTML (use existing `react-markdown` in chat)
- [ ] Export markdown to PDF (use `mdpdf` or `pandoc`)

**16.4 Conversion Pipeline**
- [ ] Document → PDF
- [ ] PDF → Text
- [ ] DOCX → Markdown
- [ ] Markdown → PDF

**16.5 Backend Commands**
- [ ] `document_extract_text(pdf_path)` → text
- [ ] `document_extract_images(pdf_path)` → image_paths
- [ ] `document_split_pdf(pdf_path, pages)` → new_pdf_path
- [ ] `document_merge_pdfs(pdf_paths)` → merged_pdf_path
- [ ] `document_convert(input_path, output_format)` → output_path

### Acceptance Criteria:
- [ ] Can extract text from PDF
- [ ] Can convert DOCX to PDF
- [ ] Can merge 3 PDFs into one

### Risks:
- **LibreOffice dependency:** Requires LibreOffice installed on user's system
  - **Mitigation:** Detect if LibreOffice is installed, show instructions if not

---

## **MILESTONE 17: Mobile Companion MCP**
**Sprint:** Days 76-90 (Sprint 7)
**Team:** 1 contractor (React Native) + 1 engineer (Rust for P2P)
**Status (2025-10-31 Audit):** 🔴 <5% complete – mobile companion app and WebRTC stack not yet started.

### Objectives:
- React Native app (iOS + Android)
- WebRTC P2P connection for low-latency remote control
- QR code pairing with signaling server
- Remote screen preview and mobile-triggered actions

### Deliverables:

**17.1 Mobile App (React Native)**
- [ ] Initialize Expo project
- [ ] Screens:
  - Home screen (QR code scanner)
  - Connected screen (desktop preview + action buttons)
  - Settings screen
- [ ] Features:
  - Scan QR code to pair
  - Live desktop preview (WebRTC video stream)
  - Trigger actions remotely:
    - "Click here" (tap on preview)
    - Voice command (whisper transcription)
    - Quick actions (predefined commands)

**17.2 WebRTC P2P (Rust)**
- [ ] Use `webrtc` crate
- [ ] Desktop as sender (capture screen, stream via RTC)
- [ ] Mobile as receiver (display video stream)
- [ ] Data channel for commands (mobile → desktop)
- [ ] STUN/TURN server (Cloudflare's public STUN)

**17.3 Signaling Server**
- [ ] Simple WebSocket server (Cloudflare Workers or Rust + `tungstenite`)
- [ ] Pairing flow:
  1. Desktop generates pairing code (6-digit)
  2. Desktop connects to signaling server with code
  3. Mobile scans QR code (contains code + server URL)
  4. Mobile connects to signaling server with code
  5. Signaling server relays ICE candidates
  6. WebRTC P2P connection established
  7. Signaling server disconnects (no longer needed)

**17.4 QR Code Generation**
- [ ] Desktop generates QR code (contains pairing code + signaling server URL)
- [ ] Display QR code in desktop app (Settings > Mobile Companion)

**17.5 Backend Commands**
- [ ] `mobile_generate_pairing_code()` → code + qr_data
- [ ] `mobile_start_stream()` → start WebRTC stream
- [ ] `mobile_stop_stream()` → stop stream

### Acceptance Criteria:
- [ ] Can pair mobile app with desktop via QR code
- [ ] Desktop screen appears on mobile with <500ms latency
- [ ] Can tap on mobile preview to trigger click on desktop

### Risks:
- **WebRTC complexity:** P2P connection may fail behind corporate firewalls
  - **Mitigation:** Provide TURN server as fallback (relay mode)
- **App store rejection:** iOS may reject app for automation capabilities
  - **Mitigation:** Distribute via TestFlight for v1.0, pursue App Store later

---

## **MILESTONE 18: Security & Polish**
**Sprint:** Days 76-90 (Sprint 7)
**Team:** 2 engineers
**Status (2025-10-31 Audit):** 🟡 50% complete – guardrails, permissions UI, command palette, accessibility, and QA hardening outstanding.

### Objectives:
- Security MCP (keyring, encryption, guardrails)
- Permission system (app whitelisting, dangerous action confirmations)
- Complete settings UI (all configurations accessible)
- Command palette, shortcuts, accessibility
- End-to-end testing & QA

### Deliverables:

**18.1 Security MCP**
- [ ] `security/keyring.rs`:
  - Store API keys in OS keyring (Windows Credential Manager)
  - Retrieve keys at runtime (never in SQLite plaintext)
- [ ] `security/encryption.rs`:
  - Encrypt sensitive fields in SQLite (AES-256-GCM)
  - Encrypt file attachments if user enables
- [ ] `security/guardrails.rs`:
  - Detect prompt injection attempts
  - Flag suspicious commands:
    - "Delete C:\\Windows"
    - "Send all files to http://..."
  - Show confirmation dialog
- [ ] `security/sandbox.rs`:
  - Run MCPs in separate processes (limited OS permissions)
  - Prevent access to sensitive directories without consent

**18.2 Permission System**
- [ ] `security/permissions.rs`:
  - App whitelist (user selects allowed apps)
  - Domain whitelist (allowed URLs for browser automation)
  - Dangerous action confirmations:
    - File deletion (10+ files)
    - System modification (registry, services)
    - Send email to >10 recipients
- [ ] UI: Permission manager in Settings

**18.3 Settings UI**
- [ ] Settings panel with tabs:
  - **Providers:** Add/edit/test API keys
  - **Router:** Configure routing rules (simple/complex/creative → model)
  - **Permissions:** Whitelist apps/domains
  - **Overlay:** Customize visualization effects
  - **Hotkeys:** Configure global shortcuts
  - **About:** Version, license, support links
- [ ] Export/import settings (JSON file)

**18.4 Command Palette**
- [ ] Install `cmdk` library
- [ ] Trigger: Cmd+K (Mac) / Ctrl+K (Windows)
- [ ] Commands:
  - New conversation
  - Switch conversation
  - Open settings
  - Toggle theme
  - Run automation (search history)
- [ ] Fuzzy search (Fuse.js)

**18.5 Keyboard Shortcuts**
- [ ] Global hotkeys (Rust + `rdev`):
  - Ctrl+Shift+A: Show/hide window
  - Ctrl+Shift+C: Copy selected text + ask AI
- [ ] In-app shortcuts:
  - Ctrl+N: New conversation
  - Ctrl+,: Settings
  - Ctrl+K: Command palette
  - Ctrl+1-9: Switch tabs (editor, terminal)

**18.6 Accessibility**
- [ ] ARIA labels on all interactive elements
- [ ] Keyboard navigation (Tab, Shift+Tab)
- [ ] Focus indicators (2px outline)
- [ ] Screen reader announcements (e.g., "Message sent")

**18.7 Testing & QA**
- [ ] Unit tests (Rust): >70% coverage
- [ ] Integration tests (Playwright): Critical user flows
- [ ] Manual QA checklist:
  - Test on Windows 10, Windows 11
  - Test on 1080p, 1440p, 4K monitors
  - Test with 100%, 125%, 150%, 200% DPI scaling
  - Test all 16 MCPs
  - Test with slow internet (simulate 3G)
  - Test with high latency (100ms+ ping to LLM APIs)

**18.8 Documentation**
- [ ] User guide (50+ FAQ articles)
- [ ] Video tutorials (YouTube)
- [ ] Developer docs (how to build custom MCPs)

### Acceptance Criteria:
- [ ] API keys stored securely (not in plaintext SQLite)
- [ ] Dangerous actions show confirmation dialog
- [ ] Command palette works, fuzzy search finds commands
- [ ] All tests pass, <1% crash rate in QA
- [ ] User guide covers all features

### Risks:
- **Security vulnerabilities:** May discover critical issues late
  - **Mitigation:** Security audit by external firm (Week 66)

---

## Post-v1.0 Roadmap (v1.1, v1.2, v1.3)

### v1.1 (Month 18-20)
- **Media MCP:** Image/video processing, audio transcription
- **Workflow MCP:** State machine orchestration, scheduled execution
- **macOS Support:** Port to macOS (requires AppKit instead of Win32)

### v1.2 (Month 21-24)
- **Team Tier:** Shared workflows, team dashboard, usage allocation
- **Kubernetes MCP:** Deploy/manage K8s workloads
- **Docker MCP:** Container management

### v1.3 (Month 25-30)
- **Enterprise Features:** SSO, RBAC, audit logs
- **On-Premise Deployment:** Docker image for self-hosting
- **Linux Support:** Port to Linux (requires X11/Wayland)

---

## Risk Management

### Technical Risks

**1. Windows UI Automation Reliability**
- **Risk:** UIA may not work on all apps (especially Electron apps)
- **Probability:** MEDIUM (40%)
- **Impact:** HIGH (core value prop)
- **Mitigation:** Fallback to image recognition (OpenCV)

**2. LLM API Changes**
- **Risk:** OpenAI/Anthropic may change APIs, breaking integrations
- **Probability:** LOW (20%)
- **Impact:** MEDIUM
- **Mitigation:** Abstract provider interface, monitor API changelogs

**3. WebRTC P2P Failures**
- **Risk:** Corporate firewalls may block WebRTC
- **Probability:** MEDIUM (30%)
- **Impact:** MEDIUM (mobile companion won't work)
- **Mitigation:** Provide TURN server for relay mode

### Business Risks

**4. Risk: Failure to Meet 3-Month Target**
- **Risk:** Complex scope (16 MCPs) leads to delays beyond the 90-day sprint
- **Probability:** MEDIUM (40% - mitigated by AI-acceleration)
- **Impact:** CRITICAL (delays PLG motion, burns runway, misses market window)
- **Mitigation:**
  - Daily sprint standups with AI pair programming velocity tracking
  - Any deviation requires immediate scope re-evaluation, given the non-negotiable timeline enabled by AI-accelerated development
  - Leverage Claude Max 20x usage for rapid prototyping and debugging
  - Parallelize work across milestones where possible (e.g., Mobile + Security in Sprint 7)
  - Pre-commit to deferring non-critical features to v1.1 if timeline at risk

**5. Lovable Displacement Adoption**
- **Risk:** Migration tooling underperforms and Lovable customers do not convert fast enough
- **Probability:** MEDIUM (45%)
- **Impact:** CRITICAL (miss $100M ARR run-rate at Day 150)
- **Mitigation:**
  - Launch Lovable migration landing page Day 10 with SDR follow-up under 2 hours
  - Internal design partner beta Day 30 (20 Lovable teams), paid beta Day 45 (50 teams) to validate migration UX
  - Displacement launch Day 61 with concierge team, buyout credits, and public ROI calculator
  - Pivot to targeted enterprise deals if PLG displacement funnel lags by Week 12

### Legal Risks

**6. Prompt Injection Lawsuits**
- **Risk:** User gets hacked via prompt injection, sues AGI Workforce
- **Probability:** LOW (10%)
- **Impact:** CRITICAL (company-ending)
- **Mitigation:**
  - Legal disclaimer in ToS: "User is responsible for automation actions"
  - Guardrails to detect suspicious commands
  - Liability insurance

---

## Success Metrics

### Product Metrics
- **Task Success Rate:** >95% (automation tasks complete without errors)
- **Crash Rate:** <0.1% (less than 1 crash per 1,000 sessions)
- **Average Cost Per Task:** <$0.0002 (via smart router + caching)
- **Cache Hit Rate:** >40%

### Business Metrics
- **Day 45 (Lovable parity):** 10,000 Pro seats, 25 Lovable migrations live
- **Day 90 (Marketplace GA):** 45,000 Pro seats, $20M ARR, 80 enterprise logos
- **Day 150 ($100M milestone):** 120,000 Pro seats, 24,000 Scale seats, 220 enterprise logos
- **LTV:CAC Ratio:** >4:1 (driven by migration efficiency + marketplace expansion)

### Timeline Metrics
- **Milestones On-Time:** >80% (hit deadline for 15 out of 18 milestones)
- **Code Quality:** >70% test coverage, Clippy clean, ESLint zero warnings

---

## Team & Hiring

**Current Team:**
- 4 Full-Time Engineers (founder + 3 hires) split across UI automation, LLM router, marketplace, and infrastructure pods
- 1 Product/Growth lead orchestrating Lovable displacement experiments

**Hiring Plan:**
- **Day 30:** Add migration concierge squad (1 SDR, 1 solutions engineer) to accelerate Lovable conversions
- **Day 60:** Contract security/compliance lead (6-week engagement) for SOC 2 readiness
- **Day 90:** Marketplace PM/designer duo to scale third-party workflows and monetization
- **Day 120:** Customer success lead + automation support specialists to sustain hypergrowth

**Total Budget (5-Month Sprint to $100M ARR):**
- Salaries: $250K (core engineering + growth pods)
- Contractors & Specialists: $95K (security, migration concierge, design, QA)
- Tools & Infrastructure: $25K (LLM credits, analytics, support tooling)
- GTM Experiments & Incentives: $30K (Lovable buyout credits, referral rewards)
- **Total Sprint Budget:** $400K

**Post-Milestone Investments (Day 151+):**
- Ongoing product & GTM scaling: $600K (global expansion, compliance, support)
- **Total Year-1 Budget:** ~$1M with $100M ARR run-rate coverage

---

## Appendix: Gantt Chart (Text-Based)

`
Milestone                          | Days 1-15 | Days 16-30 | Days 31-45 | Days 46-60 | Days 61-75 | Days 76-90 | Days 91-105 | Days 106-120 | Days 121-150
------------------------------------------------------------------------------------------------------------------------------------------------------------
M1: Foundation & Gap Audit         | ====      |            |            |            |            |            |             |              |              
M2: Core UI Shell                  |  ==       | ==         |            |            |            |            |             |              |              
M3: Chat Interface                 |           | ====       |            |            |            |            |             |              |              
M4: LLM Router & Cost Analytics    |           | ===        |            |            |            |            |             |              |              
M5: Windows Automation             |           |   ==       | ==         |            |            |            |             |              |              
M6: Browser Automation             |           |    ==      | ==         |            |            |            |             |              |              
M7: Code Editor                    |           |            | ===        |            |            |            |             |              |              
M8: Terminal                       |           |            |  ==        | ==         |            |            |             |              |              
M9: Filesystem                     |           |            |            | ===        |            |            |             |              |              
M10: Database                      |           |            |            | ===        |            |            |             |              |              
M11: API Integrations              |           |            |            | ==         | ==         |            |             |              |              
M12: Communications & Calendar     |           |            |            |            | ====       |            |             |              |              
M13: Productivity & Marketplace    |           |            |            |            |  ==        | ==         |             |              |              
M14: Cloud Storage                 |           |            |            |            |   ==       | ==         |             |              |              
M15: Workflow Engine               |           |            |            |            |            | ===        |             |              |              
M16: Security & Control Plane      |           |            |            |            |            | ==         | ==          |              |              
M17: Mobile & Companion            |           |            |            |            |            |  ==        | ==          |              |              
M18: Hypergrowth Polish & GTM      |           |            |            |            |            |            | ==          | ==           | ===          
------------------------------------------------------------------------------------------------------------------------------------------------------------
Lovable Parity GA                  |           |            | ***        |            |            |            |             |              |              
Marketplace + Scale Tier GA        |           |            |            |            | ***        |            |             |              |              
 ARR Run-Rate                 |           |            |            |            |            |            |             |              | ***          
`

---

## Approval & Sign-Off

**This development plan v3.0 supersedes v2.1 and incorporates the 2025-10-31 implementation audit findings.**

**Key v3.0 Updates (2025-10-31):**
- Added an implementation status dashboard aligning roadmap assumptions with actual build progress.
- Updated milestone status callouts to show completed, in-progress, and not-started MCPs.
- Synced risk, timeline, and budget notes with the Lovable displacement hypergrowth target while acknowledging remaining gaps.

**Approved by:**
- Product Lead: ________________ (Date: ________)
- Tech Lead: ________________ (Date: ________)

**Next Review:** Day 60 (end of Sprint 4 checkpoint – validate MCP UIs and security polish)

---

**End of Development Plan v3.0**

