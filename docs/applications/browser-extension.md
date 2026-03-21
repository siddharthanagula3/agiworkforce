# Browser Extension Product & Technical Specification

## 1. Mission

The browser extension should be the browser-side bridge for AGI Workforce. It should capture live page context, execute safe browser-local actions, and expose browser capabilities to the desktop runtime without becoming an isolated product.

## 2. Users and jobs-to-be-done

### Primary users

- desktop users working in browser-heavy workflows
- users who want page-aware automation
- users who want browser capture, screenshot, autofill, or page actions from AGI Workforce

### Jobs-to-be-done

- send current-page context to AGI Workforce
- ask questions about the live page
- perform guided actions on the page
- capture screenshots and metadata
- keep a lightweight browser-native control surface available

## 3. Scope and feature ownership

### The extension owns

- browser DOM/page context capture
- browser-local action execution
- popup and side-panel browser UX
- native messaging handshake to desktop
- browser-local workflow helpers such as page capture and autofill

### The extension does not own

- primary LM orchestration
- full conversation history for the overall product
- privileged local execution beyond browser APIs
- billing, account lifecycle, or product-wide state ownership

## 4. Feature set

### Context features

- active-tab metadata capture
- selected text capture
- page HTML capture with safe size limits
- page metadata and browser-state capture
- per-tab WebMCP tool discovery

### Interaction features

- popup quick actions
- side-panel chat/workflow interface
- keyboard shortcuts for primary actions
- connection status and desktop availability indicators

### Automation features

- browser action forwarding to desktop
- page action execution
- screenshot capture
- job and form autofill helpers
- tab grouping and lightweight tab workflow support
- scheduled browser-side tasks using alarms where appropriate

## 4A. Competitive benchmark lens

Three primary competitors define the current bar for AI browser integration. Our extension design should close gaps against each while leaning into the architectural advantage of being a lightweight bridge that strengthens the desktop runtime rather than trying to become a standalone AI-native browser.

### Claude in Chrome

Claude in Chrome (beta, available on all paid plans) operates as a Chrome side panel that can read, click, and navigate websites. It manages multiple tabs, integrates with Claude Code (build in a terminal then test in the browser), and supports workflow recording where users teach Claude multi-step browser tasks that can be replayed later. Scheduled recurring browser tasks run on daily, weekly, or monthly cadences. Anthropic reports prompt injection success rates reduced from 23.6% to 11.2% through layered safety mitigations. Pro subscribers use Haiku 4.5 for browser work; Max, Team, and Enterprise subscribers get Opus 4.6.

Our extension should match workflow recording depth and scheduled task reliability. The native messaging bridge already gives us a path Claude in Chrome lacks: coupling browser context with desktop-grade agent orchestration, multi-model routing, and the full 150+ skill library.

Reference: https://www.anthropic.com/news/claude-for-chrome

### ChatGPT Atlas

ChatGPT Atlas (macOS) is an AI-native Chromium browser rather than an extension. It offers a sidebar for webpage Q&A, summarization, and cross-page comparison. Browser Memory lets Atlas remember context from previously visited sites and recall it in future sessions. Agent Mode enables autonomous task automation across browser tabs. Multi-account support (personal, work, school) lets users switch contexts. OpenAI acknowledges prompt injection “may never be fully solved” but applies guardrails at the model and application layers.

Atlas’s Browser Memory and Agent Mode autonomy set a high bar. Our extension-plus-desktop architecture can approximate these through the desktop memory store and bounded autonomous execution piped through native messaging, but explicit parity features for cross-session browser context and multi-account profiles are gaps today.

Reference: https://openai.com/index/introducing-chatgpt-atlas/

### Perplexity Comet

Perplexity Comet (desktop and iOS, launched March 18, 2026) is free on mobile and powered by Opus 4.6 for Max-tier users. Comet’s AI monitors open tabs and maintains cross-page context automatically. It supports agentic commerce (ordering products, booking flights, comparing prices), voice mode for hands-free browser interaction, and Deep Research integration for multi-step investigative queries across the live web.

Comet’s agentic commerce and cross-page awareness push the boundary of what browser AI can do autonomously. Our extension can feed tab context to the desktop agent loop, but we lack native commerce actions, voice mode at the browser layer, and integrated research workflows today.

Reference: https://www.perplexity.ai/comet

### Other notable entrants

- **Gemini in Chrome** (Auto Browse preview): Google’s 3B+ Chrome user base gives Gemini in Chrome unmatched distribution. Project Mariner scores 83.5% on WebVoyager, handles 10 simultaneous tasks, and is available on AI Ultra ($249.99/mo).
- **Dia Browser** (Atlassian $610M acquisition): A purpose-built AI browser betting that the browser chrome itself should be AI-native, not bolted on.
- **Firefox AI Controls**: Mozilla’s “kill switch” philosophy provides user-level controls to disable all AI features, positioning privacy as the differentiator.

Our positioning is intentionally different from these full-browser plays. We are a lightweight bridge that captures browser context and executes bounded actions while desktop owns orchestration, model routing, and long-lived agent state. This keeps the extension small, auditable, and complementary to whichever browser the user prefers.

## 5. End-to-end flows

### Flow A: user opens the popup and checks desktop status

1. Popup initializes.
2. It queries extension background state.
3. Background checks native host/desktop connection status.
4. Popup renders connection state, active tab metadata, and quick actions.
5. User can launch the side panel, capture the page, or refresh status.

### Flow B: user asks about the current page from the side panel

1. Side panel loads prior browser-local messages.
2. It requests or receives current page context.
3. The request is forwarded through background/native messaging or a controlled fallback path.
4. The response streams back into the side panel chat area.
5. Messages persist locally only at the browser level needed for this UX.

### Flow C: desktop asks the browser to do something

1. Desktop sends a browser action request through native messaging.
2. Background validates the request and routes it to the active tab or content script.
3. Content/injected scripts perform the browser-side action.
4. Result is returned to background, then to desktop.
5. UI reflects success, failure, or recovery state.

## 6. UI, look, and layout

### Popup look and layout

The popup should be a compact operational card:

- connection status card
- active tab info
- action buttons for capture, refresh, side panel, and grouping
- minimal stats and version info

It should load instantly and answer one question first: “Is the browser connected to desktop and ready?”

### Side-panel look and layout

The side panel should be a lightweight dark browser workspace:

- compact header with title, model/connection state, and quick actions
- main message area
- empty state with useful prompts or actions
- bottom composer or action input
- secondary tab for workflows/tool discovery where relevant

### Visual rules

- use browser-safe, low-overhead UI
- emphasize state clarity over decoration
- keep the panel narrow-friendly and readable
- avoid full-page-app complexity inside the extension

## 7. UI components

### Popup components

- status card
- tab metadata display
- capture button
- refresh button
- side-panel open button
- tab-group action button

### Side-panel components

- header with connection/model state
- message list
- message bubble renderer
- empty state
- command chips or quick actions
- workflow/tool list
- recording state indicator where workflows are captured

### Component rules

- all components should keep startup and render overhead low
- no component should depend on a heavyweight framework runtime if simple DOM code is enough
- chat rendering must be sanitized
- credential UI must never default to insecure storage

## 8. Frontend architecture

### Frontend surfaces

- popup page
- side panel
- content script
- injected script

### Responsibilities

- render browser-local UI
- capture browser context
- forward user actions to background
- display streaming chat/workflow state

### Key modules

- `apps/extension/src/popup.ts`
- `apps/extension/src/side_panel.ts`
- `apps/extension/src/content.ts`
- `apps/extension/src/injected.js`

## 9. Backend/runtime architecture

For the extension, the backend is the service-worker/background runtime plus the native messaging bridge.

### Responsibilities

- maintain connection state
- manage reconnect backoff
- queue and route messages
- speak native messaging protocol
- mediate between UI, content scripts, and desktop

### Key modules

- `apps/extension/src/background.ts`
- `apps/extension/src/types.ts`
- `apps/extension/src/utils.ts`
- `apps/extension/src/webmcp.ts`

## 10. LM architecture

### Ownership rule

The extension should not be the primary owner of LM routing.

### Expected behavior

- preferred path: desktop owns the request, model choice, tools, and memory
- acceptable fallback: a lightweight, session-scoped extension-side model path for page Q&A if desktop is unavailable
- extension-side inference, if used at all, should be narrow and disposable

### Model rules

- keep API keys session-scoped rather than durable in plaintext browser storage
- avoid building complex multi-model logic into the extension
- do not make browser-local LM logic a product dependency

## 11. API architecture

### Internal APIs

- `chrome.runtime.sendMessage`
- native messaging request/response envelopes
- content-script forwarding messages
- storage change listeners

### External APIs

- hosted AGI Workforce endpoints only where required
- browser APIs for tabs, storage, notifications, alarms, side panel, cookies, scripting

### API rules

- every message must have a clear type
- timeouts must exist for forwarded requests
- reconnect logic must avoid infinite permission loops
- host permissions should remain tightly scoped

## 12. Tool architecture

### Tool categories

- page context capture
- screenshot capture
- page metadata extraction
- page action execution
- autofill and form helpers
- WebMCP discovery and exposure

### Tool rules

- tools should only do what the browser can safely and deterministically do
- desktop should own higher-order orchestration
- browser actions must validate target context and return structured status

## 13. Data, state, and sync

### Local state

- connection state
- pending message queue
- limited stored side-panel messages
- per-tab discovered tool catalog
- temporary session-scoped credentials if fallback mode exists

### Sync rules

- keep browser-local state minimal
- do not store product-wide truth here
- desktop remains the long-lived authority for agent workflows

## 14. Security and privacy

- no persistent plaintext credential storage
- sanitize rendered HTML/markdown
- restrict permissions and host permissions
- enforce reconnect limits to avoid hostile prompt loops or system-dialog spam
- validate browser actions before execution

## 15. Performance and reliability

- popup must feel instant
- side panel must recover from refreshes and reconnects
- message queues should survive short interruptions
- page capture must bound payload size
- reconnect logic should be exponential and capped

## 16. Observability, testing, and release gates

### Testing expectations

- connection lifecycle tests
- background reconnection tests
- page metadata and capture tests
- side-panel rendering tests
- WebMCP tests
- autofill/runtime tests

### Release gates

- native connection works
- popup state is accurate
- side panel can send and render messages
- page capture works on common sites
- browser action routing fails safely

## 17. Definition of done

The extension is in the right state when:

- it gives AGI Workforce reliable browser context
- it can safely execute browser-local actions
- it feels lightweight and dependable
- it strengthens desktop instead of competing with it

## 18. Canonical implementation anchors

- `apps/extension/manifest.json`
- `apps/extension/src/background.ts`
- `apps/extension/src/side_panel.ts`
- `apps/extension/src/popup.ts`
- `apps/extension/src/content.ts`
- `apps/extension/src/webmcp.ts`

## 19. Screen inventory

### Browser UI surfaces

- popup
- side panel
- content script interactions inside the current page

### Popup sections

- connection status
- current tab info
- quick actions
- extension stats

### Side-panel sections

- header and connection/model state
- chat transcript
- empty state and quick commands
- workflows/tool discovery tab
- composer/input area

## 20. Component and capability inventory

### UI components

- status card
- quick action buttons
- message bubbles
- empty state
- command chips
- workflow/tool list

### Runtime capabilities

- native host connection
- content-script messaging
- page context capture
- screenshot capture
- autofill flows
- WebMCP discovery

## 21. API and tool inventory

### Browser API inventory

- `tabs`
- `storage`
- `nativeMessaging`
- `alarms`
- `contextMenus`
- `sidePanel`
- `scripting`
- `cookies`
- `notifications`
- `tabGroups`

### Tool inventory

- page capture
- screenshot capture
- page action execution
- browser workflow recording
- tab grouping
- autofill helpers

## 22. Phased roadmap

### Phase 1: browser agent reliability

- Harden Claude in Chrome-style workflow recording: record, save, replay, and edit multi-step browser workflows with deterministic step identification
- Improve scheduled task quality so browser-side alarms execute reliably across sleep/wake cycles and report results back to desktop
- Deepen WebMCP tool discovery so the extension surfaces page-registered tools to the desktop agent loop automatically, including dynamic tools that appear after SPA navigation
- Stabilize native messaging lifecycle with reconnect telemetry and failure-mode classification

### Phase 2: bounded autonomous execution

- Implement approve-and-go browser tasks modeled on Atlas Agent Mode: user reviews a plan, then execution proceeds within safety constraints without per-step confirmation
- Add cross-tab coordination so the agent can manage multiple tabs as a workspace (open, read, compare, close) within a single task
- Build page-scoped approval workflows where the user grants action permissions per origin rather than globally, reducing approval fatigue on trusted sites
- Surface read vs write action distinctions in both UI and execution paths

### Phase 3: AI-native browser alignment

- Integrate with Atlas/Comet patterns for commerce and research: agentic form fills, price comparison, booking confirmations with user approval gates
- Implement deeper page intelligence through Browser Memory-style cross-session context, feeding visited-page summaries into the desktop memory store
- Render MCP Apps in the side panel when MCP servers return interactive UI resources, turning the extension into a lightweight app host
- Add voice mode passthrough from browser microphone to desktop voice pipeline

## 23. Gap analysis

### Gaps vs Claude in Chrome

- **Workflow recording maturity**: Claude in Chrome's “teach Claude a workflow” pattern is production-grade with step editing and error recovery. Our recording captures steps but lacks edit-in-place, conditional branching, and graceful recovery when a page structure changes between recordings.
- **Scheduled task polish**: Claude in Chrome supports daily/weekly/monthly browser tasks as a first-class feature. Our alarms-based scheduling works but lacks result reporting, retry logic, and a management UI for viewing and editing scheduled tasks.
- **Prompt injection defense sophistication**: Anthropic reports reducing prompt injection success from 23.6% to 11.2% with layered mitigations. Our defenses (DOMPurify sanitization, cookie domain blocking, bridge URL validation) cover the basics but lack the model-level and application-level injection detection layers that Anthropic applies.

### Gaps vs ChatGPT Atlas

- **Separate browser product**: Atlas is a full Chromium browser; we are an extension. This means Atlas controls the entire rendering pipeline, network stack, and tab lifecycle. We operate within Chrome's extension sandbox, which limits low-level browser control but keeps us browser-agnostic.
- **Browser Memory**: Atlas remembers context from previously visited sites and uses it in future sessions. We have no equivalent cross-session browser context store today. Desktop memory exists but is not wired to browser-originated page context.
- **Multi-account context**: Atlas supports personal/work/school profiles with separate browsing contexts. Our extension has a single identity model tied to the desktop connection.
- **Agent Mode autonomy**: Atlas Agent Mode runs autonomous multi-step browser tasks after a single approval. Our execution model still requires per-action confirmation for most browser mutations.

### Gaps vs Perplexity Comet

- **Agentic commerce capabilities**: Comet can order products, book flights, and compare prices autonomously. We have no commerce-oriented browser actions today.
- **Cross-page context awareness**: Comet monitors open tabs and maintains context across them automatically. Our extension captures context per-tab on demand but does not maintain a unified cross-tab context model.
- **Voice mode in browser**: Comet supports voice interaction at the browser layer. Our voice pipeline lives in the desktop app and is not wired through to the extension.
- **Deep Research integration**: Comet connects to Perplexity's Deep Research for multi-step investigative queries across the live web. Our extension forwards queries to desktop but lacks a dedicated research workflow that coordinates browser navigation with iterative search.

## 24. Feature acceptance criteria

| Feature                     | Acceptance criteria                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native connection lifecycle | Extension connects to native host reliably, exposes clear status, retries with bounded backoff, and stops before infinite permission/reconnect loops.                                 |
| Popup quick controls        | Popup loads quickly, shows accurate connection and tab state, and lets the user trigger core actions with clear feedback.                                                             |
| Side-panel chat             | Side panel can display prior context, send requests, stream replies, and recover from refresh or reconnect without message corruption.                                                |
| Page context capture        | Extension can capture URL, title, selection, and bounded page content reliably across common pages.                                                                                   |
| Screenshot capture          | User-triggered screenshots succeed on supported pages and failure states are surfaced clearly.                                                                                        |
| Browser action execution    | Browser actions route through validated messages, act on the right tab/page, and return structured success/failure output.                                                            |
| Autofill/workflow helpers   | Autofill and browser workflow helpers are deterministic, user-visible, and do not silently mutate pages without intent.                                                               |
| Privacy and storage         | Chat render output is sanitized, browser permissions are scoped, and any temporary credentials avoid insecure persistent storage.                                                     |
| Workflow recording          | User can record, save, and replay multi-step browser workflows reliably. Replayed workflows handle minor DOM changes gracefully and surface clear errors when a step cannot complete. |
| Scheduled tasks             | Browser-side scheduled tasks execute at configured intervals (daily/weekly/monthly), survive browser restarts via alarms API, and report success/failure results back to desktop.     |
| WebMCP tool discovery       | Extension discovers page-registered WebMCP tools (both declarative and imperative) and exposes them to the desktop agent loop for invocation. Discovery updates on SPA navigation.    |
| MCP Apps rendering          | Interactive tool UIs returned by MCP servers can render in the side panel. The extension sandboxes rendered content and prevents cross-origin data leakage.                           |

## 25. Screen-by-screen implementation checklist

### Popup

- render connection state first
- show current-tab metadata clearly
- provide capture/refresh/open-side-panel actions
- provide success/error feedback after actions

### Side panel

- load persisted recent messages
- render a useful empty state
- keep header controls visible in narrow width
- support streaming, reconnect, and error states cleanly

### Background/service worker

- register all message listeners on initialization
- maintain native connection state centrally
- queue and flush pending requests safely
- handle disconnects with capped exponential backoff

### Content/injected scripts

- capture page data without over-reading
- forward action results with clear response envelopes
- fail cleanly on unsupported pages or blocked contexts

## 26. WebMCP standard alignment

The WebMCP specification (W3C Community Group draft, February 10, 2026) defines how web pages expose structured tools to AI agents. Chrome 146 Canary includes a DevTrial behind `chrome://flags/#enable-webmcp-testing`. Our `webmcp.ts` implementation already supports both discovery modes defined by the spec.

### Declarative API

Pages declare tools using HTML form attributes (`toolname`, `tooldescription`) on standard form elements. The browser or extension scans the DOM for these attributes and registers them as available tools. This approach requires zero JavaScript from the page author and works on static sites.

### Imperative API

Pages call `navigator.modelContext.registerTool()` to programmatically register tools with richer schemas, dynamic availability, and lifecycle management. This is the path for SPAs and complex applications that need to add or remove tools as the user navigates.

### Performance characteristics

WebMCP-based tool invocation shows an 89% token efficiency improvement over screenshot-based methods (the agent sends structured tool calls instead of processing pixel data). Task accuracy reaches approximately 98% on supported pages. Computational overhead is reduced by approximately 67% compared to vision-based browser agents.

### Security model

- **Origin-based permissions**: tools are scoped to the registering origin. Cross-origin tool invocation requires explicit grants.
- **User interaction gating**: `requestUserInteraction()` pauses agent execution for sensitive operations (payments, account changes, data deletion) and requires explicit user confirmation.
- **Agent invocation tracking**: every tool call is logged with the invoking agent identity, enabling audit trails for browser-side actions.

### Unresolved areas in the spec

- No standard discovery mechanism beyond scanning open tabs. Background or closed-tab tool registries are not addressed.
- No multi-agent coordination protocol. When multiple agents (desktop + extension + page-embedded) can invoke the same tool, conflict resolution is left to the implementation.
- Performance degrades beyond approximately 50 tools per page. The spec recommends keeping tool registrations bounded.

### Our implementation

`apps/extension/src/webmcp.ts` implements both declarative (DOM attribute scanning) and imperative (message-based registration from injected scripts) discovery. Discovered tools are forwarded to the desktop agent loop through native messaging, where they appear alongside MCP server tools in the unified tool catalog.

Reference: https://webmcp.link/

## 27. Browser agent patterns

These patterns inform how the extension should evolve its browser automation capabilities, drawing from competitor implementations and open-source browser agent projects.

### Workflow recording and replay

Modeled on Claude in Chrome's "teach Claude a workflow" pattern. The user demonstrates a multi-step browser task (click here, fill this, navigate there), and the extension records each step as a structured action with DOM selectors, expected state, and fallback strategies. Replaying a workflow re-executes the steps, using AI to adapt when selectors change or pages restructure. This is the most user-accessible form of browser automation because it requires no technical knowledge.

### Bounded autonomous execution

The user approves a plan (a sequence of intended actions), and execution proceeds within safety constraints without per-step confirmation. Constraints include: origin allowlist (only act on approved domains), action type limits (read actions proceed freely, write actions require the plan to have listed them), and time/step budgets (abort after N steps or M seconds). This balances Atlas-style Agent Mode autonomy with the safety posture our security model requires.

### Page-scoped approval

Rather than global approve/deny, users grant permissions per-page or per-origin. A user who trusts their project management tool can approve all read and navigation actions on that domain while keeping stricter controls on banking or government sites. This maps naturally to the cookie domain blocking already implemented for sensitive categories.

### Cross-tab coordination

Managing multiple tabs as a workspace: open a documentation page, a code review, and a test results page, then let the agent read across all three to answer a question or generate a summary. Cross-tab coordination requires the extension to maintain a tab-group context model and route agent requests to the correct tab.

### Hybrid execution: Playwright + AI

For predictable, well-structured steps (fill a form field, click a button with a known selector), use deterministic Playwright-style execution. For steps that require understanding (find the "submit" button on an unfamiliar page, parse a dynamic table, handle an unexpected modal), fall back to AI-driven interaction. This hybrid approach covers approximately 80% of steps deterministically and uses AI for the 20% that requires page understanding, reducing cost and latency.

### Prompt injection defense

Our layered defense posture for browser-originated content:

- **Sanitized rendering**: DOMPurify processes all HTML/markdown before rendering in the side panel or forwarding to the desktop chat. No raw page content reaches a rendering surface.
- **Cookie domain blocking**: the extension blocks cookie access for banking, government, and healthcare domains, preventing credential leakage to the agent loop.
- **Bridge URL validation**: native messaging connections validate localhost-only origins, preventing remote servers from impersonating the desktop bridge.
- **Session-scoped credentials**: any API keys used for fallback browser-local inference are session-scoped and never written to persistent browser storage.

These defenses address the most common injection vectors but do not yet match the model-level injection detection that Claude in Chrome applies. Closing that gap requires coordination with the desktop LLM router to apply content-safety classifiers to browser-originated context before it enters the agent loop.

### Reference implementations

- **Browser Use** (50K+ GitHub stars): open-source browser agent framework demonstrating reliable DOM interaction patterns and multi-step task completion.
- **Stagehand v3**: structured browser automation with AI fallback, strong selector stability, and action replay.
- **Nanobrowser**: lightweight browser agent focused on minimal overhead and privacy-first execution, relevant to our extension's "small and auditable" design goal.
