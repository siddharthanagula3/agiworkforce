# AGI Workforce — Browser Extension Platform PRD

> **Document version**: 1.1.0
> **Last updated**: 2026-03-15
> **Status**: Public Alpha
> **Owner**: Product Team
> **Platform**: Chrome Browser Extension (Manifest V3)
> **Package**: `@agiworkforce/extension` (`apps/extension/`)

---

## Table of Contents

1. [Executive Summary](#section-1-executive-summary)
2. [Platform Requirements](#section-2-platform-requirements)
3. [Feature Matrix](#section-3-feature-matrix)
4. [Screen-by-Screen UI Specification](#section-4-screen-by-screen-ui-specification)
5. [Component Architecture](#section-5-component-architecture)
6. [Data Flow & API Connections](#section-6-data-flow--api-connections)
7. [Platform-Specific Capabilities](#section-7-platform-specific-capabilities)
8. [Build, Deploy & Distribution](#section-8-build-deploy--distribution)
9. [Testing Strategy](#section-9-testing-strategy)
10. [Performance Requirements](#section-10-performance-requirements)
11. [Security](#section-11-security)
12. [Accessibility](#section-12-accessibility)
13. [Competitive Analysis](#section-13-competitive-analysis)

---

# Section 1: Executive Summary

## 1.1 Platform Vision

The AGI Workforce Browser Extension brings the full power of a desktop-class, model-agnostic AI agent directly into the user's web browser. It is the critical bridge between AGI Workforce's Tauri desktop runtime and the web content the user interacts with every day. Where competing browser extensions offer simple chat sidebars, AGI Workforce's extension provides deep DOM automation, intelligent form autofill, page context capture, and a persistent AI sidebar — all connected to the desktop app's multi-LLM agent engine via Chrome Native Messaging.

The extension transforms every web page into a workspace where AI agents can read content, fill forms, click elements, capture screenshots, manage tabs, and execute multi-step workflows — without requiring the user to switch applications or copy-paste between windows.

## 1.2 Platform Positioning

The AGI Workforce Browser Extension occupies a unique position in the market:

| Dimension                | AGI Workforce Extension             | Claude Browser Extension | ChatGPT Extension | Gemini Extension |
| ------------------------ | ----------------------------------- | ------------------------ | ----------------- | ---------------- |
| Model agnostic           | Yes (12+ providers via desktop)      | No (Anthropic only)      | No (OpenAI only)  | No (Google only) |
| Desktop app bridge       | Native messaging to Tauri           | No desktop app           | No desktop app    | No desktop app   |
| DOM automation           | Full (click, type, scroll, forms)   | Limited (page reading)   | No automation     | No automation    |
| Job application autofill | Yes (LinkedIn, Lever, Greenhouse)   | No                       | No                | No               |
| Persistent side panel    | Yes (streaming chat)                | No (popup only)          | No                | No               |
| Page context capture     | Full page + selection + screenshots | Page reading             | Page reading      | Page reading     |
| Action recording         | Yes (record and replay)             | No                       | No                | No               |
| Multi-tab management     | Yes (create, close, switch)         | No                       | No                | No               |
| Cookie management        | Yes (read, set, clear)              | No                       | No                | No               |
| Accessibility tree       | Yes (full tree extraction)          | No                       | No                | No               |

## 1.3 Target Users

### 1.3.1 Job Seekers

Users who apply to dozens or hundreds of positions and need automated form filling across LinkedIn Easy Apply, Lever, Greenhouse, Workday, and generic job portals. The extension detects the platform, maps fields to a stored profile, and fills applications in seconds rather than minutes.

### 1.3.2 Developers and Power Users

Developers who want AI agents that can interact with web applications — reading documentation, filling issue trackers, managing project boards, testing web UIs, and automating repetitive browser workflows. The desktop-bridge connection means the AI can combine browser actions with terminal commands, file operations, and multi-model reasoning.

### 1.3.3 Researchers and Analysts

Users who need to extract structured data from web pages, capture page content for AI analysis, and interact with web-based tools as part of larger research workflows. The page context capture and side panel chat make it easy to ask questions about any web page.

### 1.3.4 Enterprise Teams

Organizations that need browser automation with governance controls. The extension connects to the desktop app's ToolGuard sandbox, ensuring all browser actions are logged, rate-limited, and subject to approval policies.

## 1.4 Key Differentiators

1. **Desktop Bridge Architecture** — Unlike standalone browser extensions that rely on cloud APIs, the AGI Workforce extension bridges to a local Tauri desktop app with full multi-LLM routing, MCP tool support, and agent orchestration. This means browser actions are part of a larger agent workflow, not isolated chat interactions.

2. **Deep DOM Automation** — The extension does not just read pages. It clicks elements, fills forms, manages tabs, captures elements, scrolls, hovers, drags and drops, and executes multi-step action sequences. This is browser automation comparable to Playwright or Puppeteer, but controlled by an AI agent.

3. **Platform-Aware Job Autofill** — Proprietary form detection and autofill for LinkedIn Easy Apply, Lever, Greenhouse, and Workday. The detector identifies the platform from the URL pattern and DOM structure, maps fields to a stored user profile, and fills them using React/Vue-compatible event dispatch.

4. **Streaming Chat Side Panel** — A persistent sidebar with full markdown rendering, conversation history persistence, voice input, and page context attachment — available on every web page without navigating away.

5. **Action Recording and Replay** — Record user interactions on a page and replay them as automated sequences. This enables users to teach the AI custom workflows by demonstration.

## 1.5 Non-Negotiable Requirements

| ID        | Requirement                                                      | Rationale                                                                                                |
| --------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| EXT-NN-01 | No dynamic code evaluation in content scripts                    | CSP compliance and security — `eval()`, `Function()`, string-`setTimeout()` are categorically prohibited |
| EXT-NN-02 | Closed shadow DOM for all injected UI                            | Page JavaScript must not be able to access or modify the extension's injected elements                   |
| EXT-NN-03 | API keys stored in `chrome.storage.session` only                 | Keys are cleared when browser closes; never persisted to disk via `chrome.storage.local`                 |
| EXT-NN-04 | Content script must not increase page load by > 50ms             | Measured as Time to Interactive delta — user should not notice the extension                             |
| EXT-NN-05 | Native messaging round-trip < 100ms for DOM queries              | Desktop bridge must be fast enough to support real-time agent interaction                                |
| EXT-NN-06 | All DOM operations must use allowlists                           | `SET_ATTRIBUTE`, `EXECUTE_SCRIPT` — only pre-approved operations are permitted                           |
| EXT-NN-07 | Rate limiting on all message channels                            | 120 requests per minute per tab, 500ms screenshot cooldown                                               |
| EXT-NN-08 | No inline script injection into pages                            | All extension scripts must be packaged and declared in manifest                                          |
| EXT-NN-09 | Never auto-submit job applications without explicit confirmation | Auto-submit guard must pause at `maxSubmitSteps` and require user approval                               |
| EXT-NN-10 | Proprietary license enforced                                     | No copyleft dependencies                                                                                 |

## 1.6 Success Metrics

| Metric                                   | Target (v1.2) | Target (v2.0) |
| ---------------------------------------- | ------------- | ------------- |
| Chrome Web Store rating                  | >= 4.5 stars  | >= 4.7 stars  |
| Install-to-daily-active-use conversion   | >= 40%        | >= 60%        |
| Native messaging connection success rate | >= 95%        | >= 99%        |
| Job autofill field accuracy (LinkedIn)   | >= 90%        | >= 98%        |
| Job autofill field accuracy (Lever)      | >= 85%        | >= 95%        |
| Page context capture success rate        | >= 95%        | >= 99%        |
| Side panel chat response latency (P95)   | < 2s          | < 1s          |
| Extension load time impact on page (P95) | < 50ms        | < 30ms        |
| Content script memory overhead per tab   | < 5MB         | < 3MB         |
| Weekly active users                      | 5,000         | 50,000        |
| Chrome Web Store installs                | 10,000        | 100,000       |

---

# Section 2: Platform Requirements

## 2.1 Browser Requirements

| Requirement              | Value                                                                         |
| ------------------------ | ----------------------------------------------------------------------------- |
| Primary browser          | Google Chrome (Chromium)                                                      |
| Secondary browsers       | Microsoft Edge (Chromium), Brave, Opera, Vivaldi                              |
| Firefox support          | Roadmap — requires Manifest V3 WebExtensions port                             |
| Safari support           | Roadmap — requires WebExtension API conversion + App Store distribution       |
| Minimum Chrome version   | 114 (required for Side Panel API, `chrome.sidePanel`)                         |
| Manifest version         | V3 (Manifest V2 is deprecated and will not be supported)                      |
| Chrome DevTools Protocol | Not required for extension operation (used by desktop app's PlaywrightBridge) |

### 2.1.1 Chrome Version Feature Dependencies

| Feature                          | Minimum Chrome Version | API Used                       |
| -------------------------------- | ---------------------- | ------------------------------ |
| Side Panel                       | 114                    | `chrome.sidePanel`             |
| Service Worker (background)      | 88                     | `chrome.runtime.ServiceWorker` |
| Native Messaging                 | 28                     | `chrome.runtime.connectNative` |
| `chrome.storage.session`         | 102                    | `chrome.storage.session`       |
| `chrome.scripting.executeScript` | 88                     | `chrome.scripting`             |
| Context Menus                    | 6                      | `chrome.contextMenus`          |
| Alarms                           | 6                      | `chrome.alarms`                |
| Cookies API                      | 6                      | `chrome.cookies`               |

### 2.1.2 Feature Flags

| Flag                   | Default | Description                               |
| ---------------------- | ------- | ----------------------------------------- |
| `ext_native_messaging` | `true`  | Enable native messaging bridge to desktop |
| `ext_side_panel`       | `true`  | Enable side panel chat interface          |
| `ext_job_autofill`     | `true`  | Enable job application autofill           |
| `ext_action_recording` | `false` | Enable action recording (beta)            |
| `ext_voice_input`      | `true`  | Enable voice input in side panel          |
| `ext_page_context`     | `true`  | Enable automatic page context capture     |
| `ext_fab_overlay`      | `true`  | Enable floating action button overlay     |

## 2.2 Operating System Requirements

The browser extension itself is OS-agnostic; it runs wherever Chrome runs. However, the native messaging bridge to the desktop app requires:

| OS      | Native Messaging Host Path                                                                       | Desktop App Required              |
| ------- | ------------------------------------------------------------------------------------------------ | --------------------------------- |
| macOS   | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.agiworkforce.browser.json` | AGI Workforce Desktop for macOS   |
| Windows | Registry: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.agiworkforce.browser`            | AGI Workforce Desktop for Windows |
| Linux   | `~/.config/google-chrome/NativeMessagingHosts/com.agiworkforce.browser.json`                     | AGI Workforce Desktop for Linux   |

The extension functions in a degraded mode without the desktop app installed — the side panel chat can use a direct API key for cloud LLM access, but native messaging features (agent-driven browser automation) require the desktop app.

## 2.3 Distribution Format

| Channel                 | Format                                            | URL                                                   |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| Chrome Web Store        | `.crx` package via Chrome Web Store               | `chrome.google.com/webstore/detail/agi-workforce/...` |
| Edge Add-ons            | Same `.crx` via Microsoft Edge Add-ons            | `microsoftedge.microsoft.com/addons/detail/...`       |
| Developer sideload      | Unpacked extension from `apps/extension/dist/`    | Load via `chrome://extensions` > "Load unpacked"      |
| Enterprise distribution | `.crx` via Chrome Enterprise policy               | Managed via Google Workspace Admin Console            |
| Direct download         | `.zip` from `agiworkforce.com/download/extension` | For manual installation                               |

## 2.4 Technology Stack

| Layer                 | Technology              | Version |
| --------------------- | ----------------------- | ------- |
| Language              | TypeScript              | 5.9.3   |
| Build tool            | Vite                    | 7.3.1   |
| Minifier              | Terser                  | 5.46.0  |
| Test framework        | Vitest                  | 4.0.18  |
| DOM emulation (tests) | jsdom                   | 27.4.0  |
| Chrome types          | @types/chrome           | 0.0.261 |
| Static file copying   | vite-plugin-static-copy | 3.2.0   |
| Node.js               | >= 22.12.0              |         |
| pnpm                  | >= 9.15.3               |         |

## 2.5 Extension Identity

| Property              | Value                                                                                |
| --------------------- | ------------------------------------------------------------------------------------ |
| Name                  | AGI Workforce Browser Automation                                                     |
| Version               | 1.1.0                                                                                |
| Description           | Intelligent browser automation and integration for AGI Workforce desktop application |
| Author                | AGI Workforce                                                                        |
| Homepage              | https://agiworkforce.com                                                             |
| License               | Proprietary                                                                          |
| Extension key         | MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs4L2zq... (see manifest.json)            |
| Native messaging host | `com.agiworkforce.browser`                                                           |

---

# Section 3: Feature Matrix

## 3.1 Complete Feature List

### 3.1.1 Connection & Communication Features

| ID    | Feature                        | Priority | Status      | Description                                                                       |
| ----- | ------------------------------ | -------- | ----------- | --------------------------------------------------------------------------------- |
| F-C01 | Native messaging bridge        | P0       | Implemented | Bidirectional communication with desktop app via Chrome Native Messaging protocol |
| F-C02 | Auto-reconnect with backoff    | P0       | Implemented | Exponential backoff reconnection: 1s, 2s, 4s, 8s, 16s, 30s cap, 8 max attempts    |
| F-C03 | Connection status indicator    | P0       | Implemented | Green/amber/red dot showing desktop connection state                              |
| F-C04 | Keep-alive alarm               | P0       | Implemented | Chrome alarm fires every 60s to prevent service worker termination                |
| F-C05 | Message queue with overflow    | P1       | Implemented | Queues messages when native port is disconnected; drops at 1,000 pending          |
| F-C06 | Rate limiting                  | P0       | Implemented | 120 requests per minute per tab, 500ms screenshot cooldown                        |
| F-C07 | REST API fallback              | P1       | Implemented | Side panel can use direct API key when desktop app is not connected               |
| F-C08 | WebSocket bridge URL           | P1       | Implemented | Configurable bridge URL in settings panel for alternative connection methods      |
| F-C09 | Bridge URL change notification | P1       | Implemented | Side panel notifies background when bridge URL changes in settings                |

### 3.1.2 Page Interaction Features

| ID    | Feature                    | Priority | Status      | Description                                                                  |
| ----- | -------------------------- | -------- | ----------- | ---------------------------------------------------------------------------- |
| F-P01 | Single click               | P0       | Implemented | Click element by CSS selector; dispatches MouseEvent                         |
| F-P02 | Double click               | P0       | Implemented | Double click element by CSS selector                                         |
| F-P03 | Right click                | P0       | Implemented | Context menu trigger on element                                              |
| F-P04 | Type text                  | P0       | Implemented | Clear and type into input/textarea; dispatches input + change events         |
| F-P05 | Get text content           | P0       | Implemented | Extract text content from element by selector                                |
| F-P06 | Get attribute              | P0       | Implemented | Read named attribute from element                                            |
| F-P07 | Set attribute              | P0       | Implemented | Set attribute on element (allowlisted attributes only)                       |
| F-P08 | Wait for selector          | P0       | Implemented | Wait until CSS selector appears in DOM; 30s max timeout                      |
| F-P09 | Execute script (sandboxed) | P1       | Implemented | Named DOM operations from strict allowlist (scrollTo, getBoundingRect, etc.) |
| F-P10 | Select option              | P1       | Implemented | Select value in `<select>` dropdown                                          |
| F-P11 | Check / uncheck            | P1       | Implemented | Toggle checkbox state                                                        |
| F-P12 | Focus / blur               | P1       | Implemented | Focus or blur an element                                                     |
| F-P13 | Hover                      | P1       | Implemented | Hover over element (dispatches mouseenter/mouseover)                         |
| F-P14 | Scroll                     | P1       | Implemented | Scroll page or element by delta or to coordinates                            |
| F-P15 | Drag and drop              | P2       | Implemented | Drag from source selector to target selector                                 |
| F-P16 | Click at coordinates       | P2       | Implemented | Click at absolute x/y coordinates                                            |
| F-P17 | Run page actions           | P0       | Implemented | Execute ordered sequence of actions with delays between steps                |
| F-P18 | Element highlighting       | P1       | Implemented | Visual highlight on elements during automation                               |

### 3.1.3 Page Context & Capture Features

| ID    | Feature                    | Priority | Status      | Description                                                                                           |
| ----- | -------------------------- | -------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| F-X01 | Page info capture          | P0       | Implemented | Capture URL, title, HTML content, selected text                                                       |
| F-X02 | Screenshot capture         | P0       | Implemented | Capture visible tab as PNG/JPEG/WebP                                                                  |
| F-X03 | Element capture            | P1       | Implemented | Screenshot specific DOM element via canvas                                                            |
| F-X04 | Element info               | P1       | Implemented | Full element descriptor: tag, id, class, text, attributes, bounding rect                              |
| F-X05 | Context sync to desktop    | P0       | Implemented | Auto-sync page context on tab change or text selection                                                |
| F-X06 | Context sync deduplication | P0       | Implemented | 5-second cooldown, fingerprint-based dedup prevents redundant syncs                                   |
| F-X07 | Selected text query        | P1       | Implemented | Context menu "Ask AGI Workforce" sends selected text to desktop                                       |
| F-X08 | Full page text extraction  | P1       | Implemented | Extract `document.body.innerText` (capped at 5,000 chars for side panel, 100,000 chars for full sync) |

### 3.1.4 Form Management Features

| ID    | Feature                      | Priority | Status      | Description                                                                     |
| ----- | ---------------------------- | -------- | ----------- | ------------------------------------------------------------------------------- |
| F-F01 | Form detection               | P0       | Implemented | Detect all forms on page with field inventory                                   |
| F-F02 | Form filling                 | P0       | Implemented | Fill multiple fields by selector map with event dispatch                        |
| F-F03 | Form submission              | P1       | Implemented | Submit form by selector (calls `form.submit()` or clicks submit button)         |
| F-F04 | Job application detection    | P0       | Implemented | Detect LinkedIn/Lever job application forms from URL and DOM                    |
| F-F05 | LinkedIn Easy Apply autofill | P0       | Implemented | Platform-specific selectors for LinkedIn Easy Apply modal                       |
| F-F06 | Lever autofill               | P0       | Implemented | Platform-specific selectors for Lever application forms                         |
| F-F07 | Greenhouse autofill          | P1       | Planned     | Platform-specific selectors for Greenhouse boards                               |
| F-F08 | Workday autofill             | P2       | Planned     | Platform-specific selectors for Workday job applications                        |
| F-F09 | Generic autofill             | P1       | Implemented | CSS heuristic fallback for unrecognized platforms                               |
| F-F10 | Profile storage              | P0       | Implemented | Store and retrieve autofill profile in chrome.storage.local                     |
| F-F11 | React/Vue-compatible fill    | P0       | Implemented | Uses native value setter + event dispatch sequence (focus, input, change, blur) |
| F-F12 | File upload autofill         | P2       | Implemented | Resume and cover letter file upload via detected file inputs                    |
| F-F13 | Multi-step form navigation   | P1       | Implemented | Navigate through multi-page forms (maxSubmitSteps guard)                        |
| F-F14 | Auto-submit guard            | P0       | Implemented | User confirmation required before final submission                              |

### 3.1.5 Tab Management Features

| ID    | Feature         | Priority | Status      | Description                            |
| ----- | --------------- | -------- | ----------- | -------------------------------------- |
| F-T01 | Get all tabs    | P1       | Implemented | List all open tabs with metadata       |
| F-T02 | Create tab      | P1       | Implemented | Open new tab with specified URL        |
| F-T03 | Close tab       | P1       | Implemented | Close tab by ID                        |
| F-T04 | Switch tab      | P1       | Implemented | Activate tab by ID                     |
| F-T05 | Tab ready check | P1       | Implemented | Verify content script is loaded in tab |

### 3.1.6 Cookie Management Features

| ID    | Feature       | Priority | Status      | Description                  |
| ----- | ------------- | -------- | ----------- | ---------------------------- |
| F-K01 | Get cookies   | P2       | Implemented | Read cookies for a URL       |
| F-K02 | Set cookie    | P2       | Implemented | Create or update a cookie    |
| F-K03 | Clear cookies | P2       | Implemented | Remove all cookies for a URL |

### 3.1.7 Accessibility Features

| ID    | Feature                       | Priority | Status      | Description                                       |
| ----- | ----------------------------- | -------- | ----------- | ------------------------------------------------- |
| F-A01 | Accessibility tree extraction | P1       | Implemented | Build and return full accessibility tree for page |
| F-A02 | Focusable elements list       | P2       | Planned     | List all focusable elements on page               |

### 3.1.8 Recording Features

| ID    | Feature              | Priority | Status      | Description                                   |
| ----- | -------------------- | -------- | ----------- | --------------------------------------------- |
| F-R01 | Start recording      | P2       | Implemented | Begin recording user interactions on page     |
| F-R02 | Stop recording       | P2       | Implemented | Stop recording and return recorded actions    |
| F-R03 | Get recorded actions | P2       | Implemented | Retrieve list of recorded actions             |
| F-R04 | Action replay        | P3       | Planned     | Replay recorded actions as automated sequence |

### 3.1.9 Side Panel Chat Features

| ID    | Feature                      | Priority | Status      | Description                                                                 |
| ----- | ---------------------------- | -------- | ----------- | --------------------------------------------------------------------------- |
| F-S01 | Streaming chat               | P0       | Implemented | Real-time streaming AI responses with typing cursor animation               |
| F-S02 | Markdown rendering           | P0       | Implemented | Render markdown in assistant messages (code blocks, links, lists, headings) |
| F-S03 | HTML sanitization            | P0       | Implemented | DOMParser-based sanitizer strips scripts, iframes, event handlers           |
| F-S04 | Conversation persistence     | P1       | Implemented | Save/load up to 50 messages in chrome.storage.local                         |
| F-S05 | Page context attachment      | P0       | Implemented | Capture and attach current page text to next message                        |
| F-S06 | Voice input                  | P1       | Implemented | Web Speech API integration for voice dictation                              |
| F-S07 | API key management           | P0       | Implemented | Save key to chrome.storage.session, migrate from local                      |
| F-S08 | Connection status pill       | P0       | Implemented | Green/red indicator showing API connection state                            |
| F-S09 | Clear conversation           | P1       | Implemented | Clear all messages and stored history                                       |
| F-S10 | Settings panel               | P1       | Implemented | Configure bridge URL, toggle features                                       |
| F-S11 | Empty state                  | P0       | Implemented | Welcome message when no conversation exists                                 |
| F-S12 | Error display                | P0       | Implemented | Red error bubbles for failed requests                                       |
| F-S13 | Auto-resize input            | P1       | Implemented | Textarea grows as user types (max 120px height)                             |
| F-S14 | Conversation history context | P1       | Implemented | Send previous messages as conversation history with each request            |
| F-S15 | Thinking indicator           | P0       | Implemented | Bouncing dots animation while waiting for first token                       |

### 3.1.10 Popup Features

| ID    | Feature                           | Priority | Status      | Description                                       |
| ----- | --------------------------------- | -------- | ----------- | ------------------------------------------------- |
| F-U01 | Connection status card            | P0       | Implemented | Connected/Disconnected indicator with pulsing dot |
| F-U02 | Capture page button               | P0       | Implemented | One-click screenshot capture                      |
| F-U03 | Refresh button                    | P0       | Implemented | Refresh all status information                    |
| F-U04 | Tab count display                 | P1       | Implemented | Show number of open tabs                          |
| F-U05 | Action count display              | P1       | Implemented | Show total automation actions performed           |
| F-U06 | Session timer                     | P1       | Implemented | Show elapsed time since popup opened              |
| F-U07 | Current page info                 | P1       | Implemented | Display current tab ID and URL                    |
| F-U08 | Version display                   | P1       | Implemented | Show extension version (v1.1.0)                   |
| F-U09 | Keyboard shortcut (Cmd+R refresh) | P2       | Implemented | Cmd/Ctrl+R refreshes popup data                   |

### 3.1.11 Content Script Overlay Features

| ID    | Feature                      | Priority | Status      | Description                                            |
| ----- | ---------------------------- | -------- | ----------- | ------------------------------------------------------ |
| F-O01 | Floating action button (FAB) | P1       | Implemented | Circular button overlay on every page                  |
| F-O02 | FAB in closed shadow DOM     | P0       | Implemented | Isolated from page JavaScript                          |
| F-O03 | FAB connection status dot    | P1       | Implemented | Green/amber/red dot on FAB showing desktop connection  |
| F-O04 | FAB click opens side panel   | P1       | Implemented | Click FAB to open browser sidebar                      |
| F-O05 | Automation indicator         | P1       | Implemented | Visual indicator when page is under automation control |

### 3.1.12 Context Menu Features

| ID    | Feature                               | Priority | Status      | Description                                           |
| ----- | ------------------------------------- | -------- | ----------- | ----------------------------------------------------- |
| F-M01 | "Capture Element" on right-click      | P1       | Implemented | Screenshot the right-clicked element                  |
| F-M02 | "Get Element Info" on right-click     | P1       | Implemented | Get full element descriptor for right-clicked element |
| F-M03 | "Ask AGI Workforce" on text selection | P0       | Implemented | Send selected text as query to desktop app            |

## 3.2 Extension-Exclusive Features

These features are unique to the browser extension and not available on any other AGI Workforce platform:

| Feature                       | Description                                                         |
| ----------------------------- | ------------------------------------------------------------------- |
| DOM automation                | Full browser DOM interaction (click, type, scroll, drag-drop, etc.) |
| Page context capture          | Real-time capture of page content, screenshots, selected text       |
| Job application autofill      | Platform-aware autofill for LinkedIn, Lever, Greenhouse             |
| Content script injection      | Extension code running in page context for deep integration         |
| Context menu integration      | Right-click actions on elements and selected text                   |
| Tab management                | Create, close, switch, and query browser tabs                       |
| Cookie management             | Read, write, and clear cookies for any URL                          |
| Accessibility tree extraction | Full page accessibility tree for agent navigation                   |
| Action recording              | Record user interactions for replay                                 |
| Floating action button        | Persistent overlay on every page for quick access                   |
| Side panel chat               | Persistent AI chat sidebar alongside any web page                   |

## 3.3 Feature Parity Table vs Competitors

| Feature            | AGI Workforce             | Claude Extension    | ChatGPT Extension | Grammarly | Monica AI     |
| ------------------ | ------------------------- | ------------------- | ----------------- | --------- | ------------- |
| Side panel chat    | Yes (streaming)           | No                  | No                | No        | Yes           |
| Page reading       | Yes (full DOM)            | Yes (text only)     | Yes (text only)   | No        | Yes           |
| Form autofill      | Yes (AI-driven)           | No                  | No                | No        | Yes (limited) |
| Job autofill       | Yes (LinkedIn, Lever)     | No                  | No                | No        | No            |
| DOM automation     | Yes (full)                | No                  | No                | No        | No            |
| Screenshot capture | Yes                       | No                  | No                | No        | No            |
| Desktop app bridge | Yes (native messaging)    | No                  | No                | No        | No            |
| Multi-model        | Yes (9+ via desktop)      | No (Anthropic only) | No (OpenAI only)  | N/A       | Limited       |
| Tab management     | Yes                       | No                  | No                | No        | No            |
| Action recording   | Yes                       | No                  | No                | No        | No            |
| Accessibility tree | Yes                       | No                  | No                | No        | No            |
| Context menus      | Yes (3 items)             | Yes (1 item)        | Yes (1 item)      | Yes       | Yes           |
| Voice input        | Yes                       | No                  | No                | No        | No            |
| Offline capable    | Partial (with local LLMs) | No                  | No                | Yes       | No            |
| API key storage    | Session only (secure)     | Cookie/cloud        | Cookie/cloud      | Cloud     | Cloud         |

---

# Section 4: Screen-by-Screen UI Specification

## 4.1 Extension Popup

### 4.1.1 Overview

| Property   | Value                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| Trigger    | Click toolbar icon or `Cmd+Shift+A` / `Ctrl+Shift+A`                   |
| File       | `src/popup.html` + `src/popup.ts`                                      |
| Width      | 380px                                                                  |
| Min height | 480px                                                                  |
| Background | Gradient: `#667eea` to `#764ba2`                                       |
| Font       | System font stack: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto |

### 4.1.2 Layout Structure

```
┌──────────────────────────────────┐
│          HEADER (gradient)       │
│   "AGI Workforce"                │
│   "Browser Automation Extension" │
├──────────────────────────────────┤
│        CONTENT (white bg)        │
│                                  │
│  ┌─────────────────────────────┐ │
│  │  STATUS CARD                │ │
│  │  [●] Connected / Disconn.  │ │
│  │  Desktop app is active     │ │
│  └─────────────────────────────┘ │
│                                  │
│  ┌─────────────┐┌──────────────┐ │
│  │ 📸 Capture  ││ 🔄 Refresh  │ │
│  └─────────────┘└──────────────┘ │
│                                  │
│  ┌──────┐┌──────┐┌──────┐       │
│  │  Tabs ││ Acts ││ Time │       │
│  │  12  ││  47  ││ 3:21 │       │
│  └──────┘└──────┘└──────┘       │
│                                  │
│  ─────────── divider ──────────  │
│                                  │
│  CURRENT PAGE                    │
│  Tab ID:     1234567890          │
│  URL:        github.com/agiwo... │
│  Version:    v1.1.0              │
│                                  │
├──────────────────────────────────┤
│  Powered by AGI Workforce        │
└──────────────────────────────────┘
```

### 4.1.3 Component Inventory

#### Header Section

| Component | Type   | Content                        | Styling                                        |
| --------- | ------ | ------------------------------ | ---------------------------------------------- |
| Title     | `<h1>` | "AGI Workforce"                | 22px, weight 700, white, -0.5px letter-spacing |
| Subtitle  | `<p>`  | "Browser Automation Extension" | 12px, white, 0.9 opacity                       |

#### Status Card (`#statusCard`)

| Component        | Element | ID               | States                                                                                                        |
| ---------------- | ------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Status container | `<div>` | `statusCard`     | `.connected` class toggles background gradient                                                                |
| Status icon      | `<div>` | N/A              | 40px circle, white bg, drop shadow                                                                            |
| Status dot       | `<div>` | `statusDot`      | 12px circle; red (disconnected) with pulse animation, green (connected) with green pulse                      |
| Status title     | `<div>` | `statusTitle`    | "Connected" / "Disconnected" / "Checking connection..." / "Error"                                             |
| Status subtitle  | `<div>` | `statusSubtitle` | "Desktop app is active" / "Desktop app not detected" / "Connecting to desktop app" / "Failed to check status" |

**State Variations:**

| State        | Dot Color | Animation   | Title Text               | Subtitle Text               | Card Background                    |
| ------------ | --------- | ----------- | ------------------------ | --------------------------- | ---------------------------------- |
| Checking     | Red       | Pulse red   | "Checking connection..." | "Connecting to desktop app" | Gray gradient `#f8f9fa → #e9ecef`  |
| Connected    | Green     | Pulse green | "Connected"              | "Desktop app is active"     | Green gradient `#d4edda → #c3e6cb` |
| Disconnected | Red       | Pulse red   | "Disconnected"           | "Desktop app not detected"  | Gray gradient                      |
| Error        | Red       | Pulse red   | "Error"                  | "Failed to check status"    | Gray gradient                      |

#### Quick Actions Grid

| Component      | Element    | ID           | Label             | Class                 | Action                            |
| -------------- | ---------- | ------------ | ----------------- | --------------------- | --------------------------------- |
| Capture button | `<button>` | `captureBtn` | "📸 Capture Page" | `.action-btn.primary` | Captures screenshot of active tab |
| Refresh button | `<button>` | `refreshBtn` | "🔄 Refresh"      | `.action-btn`         | Refreshes all status information  |

**Capture Button States:**

| State     | Label             | Disabled | Duration          |
| --------- | ----------------- | -------- | ----------------- |
| Default   | "📸 Capture Page" | false    | —                 |
| Capturing | "Capturing..."    | true     | Until response    |
| Success   | "Captured!"       | true     | 2000ms then reset |
| Failed    | "Failed"          | true     | 2000ms then reset |

**Refresh Button States:**

| State      | Label           | Disabled | Duration          |
| ---------- | --------------- | -------- | ----------------- |
| Default    | "🔄 Refresh"    | false    | —                 |
| Refreshing | "Refreshing..." | true     | Until response    |
| Success    | "Refreshed"     | true     | 1000ms then reset |
| Failed     | "Failed"        | true     | 2000ms then reset |

#### Statistics Grid

| Component           | Element       | ID            | Label     | Default Value |
| ------------------- | ------------- | ------------- | --------- | ------------- |
| Tabs stat           | `.stat-card`  | N/A           | "Tabs"    | "-"           |
| Tab count value     | `.stat-value` | `tabCount`    | —         | "-"           |
| Actions stat        | `.stat-card`  | N/A           | "Actions" | "-"           |
| Action count value  | `.stat-value` | `actionCount` | —         | "-"           |
| Session stat        | `.stat-card`  | N/A           | "Session" | "-"           |
| Session timer value | `.stat-value` | `sessionTime` | —         | "0:00"        |

#### Current Page Info

| Component     | Element          | ID           | Label          | Default Value                            |
| ------------- | ---------------- | ------------ | -------------- | ---------------------------------------- |
| Section title | `.section-title` | N/A          | "Current Page" | —                                        |
| Tab ID row    | `.info-item`     | N/A          | "Tab ID"       | "-"                                      |
| Tab ID value  | `.info-value`    | `tabId`      | —              | "-"                                      |
| URL row       | `.info-item`     | N/A          | "URL"          | "-"                                      |
| URL value     | `.info-value`    | `currentUrl` | —              | "-" (truncated to 25 chars with tooltip) |
| Version row   | `.info-item`     | N/A          | "Version"      | "v1.1.0"                                 |

#### Footer

| Component   | Type  | Content         | Styling                                        |
| ----------- | ----- | --------------- | ---------------------------------------------- |
| Footer text | `<p>` | "Powered by "   | 11px, white, 0.9 opacity                       |
| Link        | `<a>` | "AGI Workforce" | White, bold, opens agiworkforce.com in new tab |

### 4.1.4 Interaction Flows

**Flow 1: Popup Opens**

1. DOM ready fires → `initializePopup()`
2. Parallel execution: `updateStatus()` + `updateTabInfo()` + `updateStats()`
3. `setupEventListeners()` attaches click handlers and storage change listener
4. `startSessionTimer()` begins 1-second interval

**Flow 2: Capture Page**

1. User clicks "📸 Capture Page"
2. Button text changes to "Capturing...", button disabled
3. Query active tab → get tab ID
4. Send `CAPTURE_SCREENSHOT` message to background service worker
5. Background captures via `chrome.tabs.captureVisibleTab()`
6. On success: button shows "Captured!" for 2s, increment action count
7. On failure: button shows "Failed" for 2s

**Flow 3: Refresh**

1. User clicks "🔄 Refresh" or presses `Cmd/Ctrl+R`
2. Button text changes to "Refreshing...", button disabled
3. Parallel: `updateStatus()` + `updateTabInfo()` + `updateStats()`
4. Button shows "Refreshed" for 1s

**Flow 4: Storage Change Detected**

1. `chrome.storage.onChanged` listener fires
2. If `connectedToDesktop` changed: call `updateStatus()`
3. If `stats` changed: update action count display

### 4.1.5 Keyboard Shortcuts

| Shortcut           | Action                 |
| ------------------ | ---------------------- |
| `Cmd+R` / `Ctrl+R` | Refresh all popup data |

---

## 4.2 Side Panel (Browser Sidebar)

### 4.2.1 Overview

| Property   | Value                                                   |
| ---------- | ------------------------------------------------------- |
| Trigger    | FAB click, or `chrome.sidePanel.open()` from background |
| File       | `src/side_panel.html` + `src/side_panel.ts`             |
| Position   | Browser sidebar (right side)                            |
| Width      | Set by browser (typically ~400px)                       |
| Height     | Full browser window height                              |
| Background | `#0f0f14` (dark theme)                                  |
| Font       | System font stack, 13px base                            |
| Framework  | Pure DOM/TypeScript, no React or Vue                    |

### 4.2.2 Layout Structure

```
┌──────────────────────────────────┐
│  HEADER                          │
│  [🤖] AGI Workforce  [⚙] [🗑]  │
│        AI Assistant              │
├──────────────────────────────────┤
│  SETTINGS BAR (hidden by default)│
│  Bridge URL: [ws://localhost:...]│
│  [Apply]                         │
├──────────────────────────────────┤
│  AUTH BAR                        │
│  [API key (stored locally)] [Save]│
│  [● Not Connected]              │
├──────────────────────────────────┤
│                                  │
│  MESSAGES AREA (scrollable)      │
│                                  │
│  ┌─────────────────────────────┐ │
│  │ EMPTY STATE (when no msgs)  │ │
│  │ 🤖                          │ │
│  │ AGI Workforce Assistant     │ │
│  │ Ask anything about the      │ │
│  │ current page, or start a    │ │
│  │ conversation below.         │ │
│  └─────────────────────────────┘ │
│                                  │
│  ┌────────────── user msg ─────┐ │
│  │ What is this page about?    │ │
│  │                      12:34 PM│ │
│  └─────────────────────────────┘ │
│                                  │
│  ┌── assistant msg ────────────┐ │
│  │ This page is about...       │ │
│  │ 12:34 PM                    │ │
│  └─────────────────────────────┘ │
│                                  │
├──────────────────────────────────┤
│  TOOLBAR                         │
│  [📄 Add page context] [🎤]    │
├──────────────────────────────────┤
│  INPUT AREA                      │
│  [Ask anything...         ] [↑] │
└──────────────────────────────────┘
```

### 4.2.3 Component Inventory

#### Header (`#sp-header`)

| Component       | Element    | ID                | Content         | Action                                               |
| --------------- | ---------- | ----------------- | --------------- | ---------------------------------------------------- |
| Logo            | `<div>`    | `sp-logo`         | "🤖"            | 26x26px, gradient `#6366f1 → #8b5cf6`, rounded 6px   |
| Title           | `<div>`    | `sp-title`        | "AGI Workforce" | 13px, weight 600, `#f1f5f9`                          |
| Model badge     | `<div>`    | `sp-model-badge`  | "AI Assistant"  | 10px, `#7c3aed` text, `#1e1b4b` bg, border `#312e81` |
| Settings button | `<button>` | `sp-settings-btn` | "⚙"             | Toggles settings bar visibility                      |
| Clear button    | `<button>` | `sp-clear-btn`    | "🗑"            | Clears all messages and stored history               |

#### Settings Bar (`#sp-settings-bar`)

| Component    | Element    | ID                    | Content      | Default                            |
| ------------ | ---------- | --------------------- | ------------ | ---------------------------------- |
| Label        | `<div>`    | N/A                   | "Bridge URL" | —                                  |
| URL input    | `<input>`  | `sp-bridge-url-input` | —            | Placeholder: "ws://localhost:8765" |
| Apply button | `<button>` | N/A                   | "Apply"      | —                                  |

**Behavior:**

- Hidden by default (`display: none`)
- Toggled via settings button (`.open` class)
- Pre-fills from `chrome.storage.local` key `agi_bridge_url`
- On Apply: saves to storage, sends `BRIDGE_URL_CHANGED` message to background, closes settings bar
- Enter key in input also triggers save

#### Auth Bar (`#sp-auth-bar`)

| Component     | Element    | ID                 | Content | Default                                                 |
| ------------- | ---------- | ------------------ | ------- | ------------------------------------------------------- |
| API key input | `<input>`  | `sp-auth-input`    | —       | Placeholder: "API key (stored locally)", type: password |
| Save button   | `<button>` | `sp-auth-save-btn` | "Save"  | —                                                       |
| Status pill   | `<div>`    | `sp-status-pill`   | —       | "● Not Connected" (red)                                 |

**Status Pill States:**

| State        | Class           | Dot Color         | Text            | Background                     |
| ------------ | --------------- | ----------------- | --------------- | ------------------------------ |
| Connected    | `.connected`    | `#22c55e` (green) | "Connected"     | `#052e16` bg, `#166534` border |
| Disconnected | `.disconnected` | `#ef4444` (red)   | "Not Connected" | `#1c0505` bg, `#7f1d1d` border |

**Auth Flow:**

1. User enters API key → clicks "Save" or presses Enter
2. Key is trimmed; empty key clears saved key and disconnects
3. Non-empty key: saved to `chrome.storage.session` (migrates from local if legacy key found)
4. Status pill updates to "Connected" (optimistic)
5. Input field cleared after save
6. Real validation happens when first message is sent

#### Messages Area (`#sp-messages`)

| Component   | Element | ID            | Description                          |
| ----------- | ------- | ------------- | ------------------------------------ |
| Container   | `<div>` | `sp-messages` | Scrollable flex column, 12px padding |
| Empty state | `<div>` | `sp-empty`    | Shown when no messages               |

**Empty State Components:**

| Component | Element | ID               | Content                                                                                 |
| --------- | ------- | ---------------- | --------------------------------------------------------------------------------------- |
| Icon      | `<div>` | `sp-empty-icon`  | "🤖" (32px, 0.5 opacity)                                                                |
| Title     | `<div>` | `sp-empty-title` | "AGI Workforce Assistant" (14px, weight 500, `#64748b`)                                 |
| Hint      | `<div>` | `sp-empty-hint`  | "Ask anything about the current page, or start a conversation below." (11px, `#334155`) |

**Message Bubble Components:**

| Component                 | Class                            | Alignment                 | Styling                                                                       |
| ------------------------- | -------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| User message wrapper      | `.sp-msg.sp-msg-user`            | Right-aligned (flex-end)  | Max-width 88%                                                                 |
| Assistant message wrapper | `.sp-msg.sp-msg-assistant`       | Left-aligned (flex-start) | Max-width 88%                                                                 |
| User bubble               | `.sp-bubble.sp-bubble-user`      | —                         | `#3730a3` bg, `#e0e7ff` text, 12px radius (3px bottom-right)                  |
| Assistant bubble          | `.sp-bubble.sp-bubble-assistant` | —                         | `#1a1a2e` bg, `#e2e8f0` text, `#1e2030` border, 12px radius (3px bottom-left) |
| Error bubble              | `.sp-bubble-error`               | —                         | `#450a0a` bg, `#7f1d1d` border, `#fca5a5` text                                |
| Streaming cursor          | `.sp-cursor::after`              | —                         | `▋` character, blinking `#6366f1`, 0.7s animation                             |
| Timestamp                 | `.sp-timestamp`                  | —                         | 10px, `#334155`                                                               |

**Thinking Indicator:**

| Component | Class          | Description                                                           |
| --------- | -------------- | --------------------------------------------------------------------- |
| Wrapper   | `.sp-thinking` | 3 bouncing dots                                                       |
| Dot       | `.sp-dot`      | 6px circle, `#6366f1`, staggered bounce animation (0.2s, 0.4s delays) |

**Markdown Rendering in Assistant Bubbles:**

| Element            | Styling                                                      |
| ------------------ | ------------------------------------------------------------ |
| `code` (inline)    | `#0f172a` bg, `#1e293b` border, `#a5f3fc` text, SF Mono 11px |
| `pre` (code block) | `#0d1117` bg, `#1e293b` border, `#c9d1d9` text, SF Mono 11px |
| `strong`           | `#f8fafc`, weight 600                                        |
| `em`               | `#cbd5e1`, italic                                            |
| `a`                | `#818cf8`, underline                                         |
| `ul`/`ol`          | 16px left padding                                            |
| `h1`               | 15px, weight 600, `#f1f5f9`                                  |
| `h2`               | 14px, weight 600, `#f1f5f9`                                  |
| `h3`               | 13px, weight 600, `#f1f5f9`                                  |
| `blockquote`       | 3px left border `#4338ca`, 8px left padding, `#94a3b8` text  |
| `hr`               | 1px top border `#1e293b`                                     |

#### Toolbar (`#sp-toolbar`)

| Component      | Element    | ID               | Content               | Action                      |
| -------------- | ---------- | ---------------- | --------------------- | --------------------------- |
| Context button | `<button>` | `sp-context-btn` | "📄 Add page context" | Toggle page context capture |
| Mic button     | `<button>` | `sp-mic-btn`     | "🎤"                  | Start/stop voice input      |

**Context Button States:**

| State       | Class          | Content               | Title                                     |
| ----------- | -------------- | --------------------- | ----------------------------------------- |
| Default     | —              | "📄 Add page context" | "Add page content to next message"        |
| Capturing   | —              | "⏳ Capturing..."     | —                                         |
| Has context | `.has-context` | "✅ Page context"     | "Page context attached — click to remove" |

**Mic Button States:**

| State         | Class     | Content                                                | Title                                       |
| ------------- | --------- | ------------------------------------------------------ | ------------------------------------------- |
| Default       | —         | "🎤"                                                   | "Voice input"                               |
| Listening     | `.active` | `<span class="sp-mic-pulse"></span>` (pulsing red dot) | "Listening... click to stop"                |
| Not supported | —         | "🎤" (0.4 opacity, not-allowed cursor)                 | "Voice input not supported in this browser" |

#### Input Area (`#sp-input-area`)

| Component   | Element      | ID            | Content | Behavior                                                                                                  |
| ----------- | ------------ | ------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| Textarea    | `<textarea>` | `sp-input`    | —       | Placeholder: "Ask anything...", auto-resize (38px min, 120px max), Enter to send, Shift+Enter for newline |
| Send button | `<button>`   | `sp-send-btn` | "↑"     | 34x34px, `#4338ca` bg, disabled during streaming                                                          |

**Send Button States:**

| State                | Background | Cursor      | Transform   |
| -------------------- | ---------- | ----------- | ----------- |
| Default              | `#4338ca`  | pointer     | —           |
| Hover                | `#3730a3`  | pointer     | scale(1.05) |
| Disabled (streaming) | `#1e1e2e`  | not-allowed | none        |

### 4.2.4 Interaction Flows

**Flow 1: Send Message**

1. User types in textarea and presses Enter (or clicks send button)
2. User message appended to messages array and rendered as right-aligned bubble
3. Messages persisted to `chrome.storage.local`
4. Pending page context (if any) cleared and attached to request
5. Thinking indicator (bouncing dots) shown
6. `CHAT_MESSAGE` sent to background service worker with: text, pageContext, conversationHistory, apiKey
7. Background routes message to AI (desktop bridge or direct API)
8. Streaming chunks arrive via `chrome.runtime.onMessage`
9. First chunk: remove thinking dots, add assistant bubble with cursor animation
10. Subsequent chunks: append to bubble, update rendered markdown
11. Final chunk (`done: true`): remove cursor, persist messages

**Flow 2: Capture Page Context**

1. User clicks "📄 Add page context"
2. Button shows "⏳ Capturing...", disabled
3. Query active tab → get tab ID
4. Execute script in tab: `document.body.innerText.slice(0, 5000)`
5. On success: store as `pendingPageContext`, button shows "✅ Page context"
6. On failure: button returns to default state
7. Click again while context attached: clears context

**Flow 3: Voice Input**

1. User clicks mic button
2. `SpeechRecognition` created (Chrome's Web Speech API)
3. Mic button shows pulsing red dot, title: "Listening... click to stop"
4. User speaks → `onresult` fires → transcript appended to textarea
5. Click mic button again or recognition ends → returns to default state
6. If Web Speech API not available: mic button shows as disabled (0.4 opacity)

**Flow 4: Clear Conversation**

1. User clicks trash icon in header
2. `messages` array cleared
3. `lastRenderedCount` reset to 0
4. Streaming state reset
5. Page context cleared
6. `chrome.storage.local` messages key removed
7. Empty state displayed

**Flow 5: Settings Panel**

1. User clicks gear icon in header
2. Settings bar slides open (`.open` class)
3. Bridge URL input pre-filled from `chrome.storage.local`
4. User modifies URL → clicks "Apply" or presses Enter
5. URL saved to `chrome.storage.local`
6. `BRIDGE_URL_CHANGED` message sent to background
7. Settings bar closes

**Flow 6: API Key Management**

1. User enters API key in auth input
2. Clicks "Save" or presses Enter
3. Key trimmed and validated (non-empty)
4. Saved to `chrome.storage.session` (cleared on browser close)
5. Status pill updates to "Connected" (optimistic)
6. Input field cleared
7. On subsequent page load: key loaded from session, migrated from local if legacy

---

## 4.3 Content Script Overlay

### 4.3.1 Overview

| Property        | Value                                      |
| --------------- | ------------------------------------------ |
| Injection       | Automatic on all pages at `document_idle`  |
| File            | `src/content.ts`                           |
| Isolation       | Closed shadow DOM for injected UI elements |
| Main frame only | `all_frames: false`                        |

### 4.3.2 Floating Action Button (FAB)

| Property        | Value                                      |
| --------------- | ------------------------------------------ |
| Position        | Fixed, bottom-right corner                 |
| Size            | 48x48px (recommended)                      |
| Shape           | Circular                                   |
| Shadow DOM mode | `closed` (page JS cannot access internals) |
| Z-index         | Maximum (above all page content)           |

**FAB Visual States:**

| State        | Dot Color         | Tooltip                         | Description                      |
| ------------ | ----------------- | ------------------------------- | -------------------------------- |
| Connected    | Green (`#28a745`) | "AGI Workforce - Connected"     | Desktop app is connected         |
| Connecting   | Amber (`#ffc107`) | "AGI Workforce - Connecting..." | Attempting to connect to desktop |
| Disconnected | Red (`#dc3545`)   | "AGI Workforce - Disconnected"  | Desktop app not found            |

**FAB Interaction:**

1. Click FAB → send `open_side_panel` message to background
2. Background calls `chrome.sidePanel.open()` for active tab
3. Side panel opens in browser sidebar

### 4.3.3 Automation Indicator

When the page is under active automation control (`automationState.isControlled = true`):

| Property   | Value                             |
| ---------- | --------------------------------- |
| Appearance | Banner or border indicator        |
| Text       | "Page under automation control"   |
| Position   | Top of page or border overlay     |
| Removal    | Removed when automation completes |

### 4.3.4 Element Highlighting

During automation operations, the target element receives a visual highlight:

| Property | Value                                  |
| -------- | -------------------------------------- |
| Style    | Outline or box-shadow overlay          |
| Color    | Extension brand color (`#6366f1`)      |
| Duration | While element is being interacted with |
| Cleanup  | Removed after action completes         |

### 4.3.5 Content Script Message Handling

The content script listens on `chrome.runtime.onMessage` and dispatches commands:

| Message Type                | Handler                                             | Returns                                                 |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| `CLICK`                     | Find element by selector → dispatch MouseEvent      | `{ success, element: { tag, id, className, text } }`    |
| `DOUBLE_CLICK`              | Find element → dispatch two MouseEvents             | `{ success }`                                           |
| `RIGHT_CLICK`               | Find element → dispatch contextmenu event           | `{ success }`                                           |
| `TYPE`                      | Find input → clear → type text → dispatch events    | `{ success, charsTyped }`                               |
| `GET_TEXT`                  | Find element → return textContent                   | `{ success, text }`                                     |
| `GET_ATTRIBUTE`             | Find element → return attribute value               | `{ success, value }`                                    |
| `SET_ATTRIBUTE`             | Validate allowlist → set attribute                  | `{ success }`                                           |
| `WAIT_FOR_SELECTOR`         | Poll DOM for selector (100ms interval, 30s max)     | `{ success, found }`                                    |
| `EXECUTE_SCRIPT`            | Validate operation name against allowlist → execute | `{ success, result }`                                   |
| `GET_PAGE_INFO`             | Gather URL, title, HTML, selected text              | `{ success, url, title, html, selectedText }`           |
| `GET_FORMS`                 | Enumerate forms and fields                          | `{ success, forms: FormInfo[] }`                        |
| `FILL_FORM`                 | Iterate field map → fill each → dispatch events     | `{ success, fieldsFilled }`                             |
| `SUBMIT_FORM`               | Find form → call submit()                           | `{ success }`                                           |
| `RUN_PAGE_ACTIONS`          | Execute action sequence with delays                 | `{ success, actionsPerformed, duration }`               |
| `AUTO_FILL_JOB_APPLICATION` | Detect platform → run autofill → return results     | `{ success, platform, filledCount, skippedCount, ... }` |
| `CAPTURE_ELEMENT`           | Find element → capture via canvas                   | `{ success, element }`                                  |
| `GET_ELEMENT_INFO`          | Find element → return full descriptor               | `{ success, element }`                                  |
| `SELECT_OPTION`             | Find select → set value → dispatch change           | `{ success }`                                           |
| `CHECK` / `UNCHECK`         | Find checkbox → set checked state                   | `{ success }`                                           |
| `FOCUS` / `BLUR`            | Find element → call focus()/blur()                  | `{ success }`                                           |
| `HOVER`                     | Find element → dispatch mouseenter/mouseover        | `{ success }`                                           |
| `SCROLL`                    | Scroll page or element by delta                     | `{ success }`                                           |
| `DRAG_DROP`                 | Find source + target → simulate drag sequence       | `{ success }`                                           |
| `CLICK_AT_COORDINATES`      | Create MouseEvent at x/y → dispatch                 | `{ success }`                                           |
| `BUILD_ACCESSIBILITY_TREE`  | Walk DOM → build a11y tree structure                | `{ success, data }`                                     |
| `START_RECORDING`           | Begin tracking user interactions                    | `{ success, recording: true }`                          |
| `STOP_RECORDING`            | Stop tracking → return recorded actions             | `{ success, actions }`                                  |
| `GET_RECORDED_ACTIONS`      | Return current recorded actions                     | `{ success, actions }`                                  |
| `CONNECTION_STATUS_CHANGED` | Update local automationState.connectionStatus       | N/A (no response)                                       |
| `SYNC_PAGE_CONTEXT`         | Gather and return page context snapshot             | `{ success, url, title, html, selectedText }`           |

---

## 4.4 Context Menu Items

### 4.4.1 Overview

Context menu items are registered by the background service worker on extension install:

| Menu Item           | ID                  | Trigger Condition          | Target Context  |
| ------------------- | ------------------- | -------------------------- | --------------- |
| "Capture Element"   | `capture-element`   | Right-click on any element | `["all"]`       |
| "Get Element Info"  | `get-element-info`  | Right-click on any element | `["all"]`       |
| "Ask AGI Workforce" | `ask-agi-workforce` | Text is selected           | `["selection"]` |

### 4.4.2 "Capture Element" Flow

1. User right-clicks on any page element
2. Selects "Capture Element" from context menu
3. Background sends `CAPTURE_ELEMENT` to content script in the tab
4. Content script identifies the element under the pointer (`lastPointerTarget`)
5. Element is captured via HTML canvas rendering
6. Screenshot data sent to desktop app via native messaging
7. Desktop agent receives screenshot for analysis

### 4.4.3 "Get Element Info" Flow

1. User right-clicks on any page element
2. Selects "Get Element Info" from context menu
3. Background sends `GET_ELEMENT_INFO` to content script
4. Content script returns: tag name, id, classes, text content, attributes, bounding rect
5. Element descriptor sent to desktop app
6. Desktop agent can use the information for targeted automation

### 4.4.4 "Ask AGI Workforce" Flow

1. User selects text on a page
2. Right-clicks the selection
3. Selects "Ask AGI Workforce" from context menu
4. Background captures the selected text and page URL
5. Sends `SelectedTextQuery` to desktop app via native messaging
6. Desktop app opens the chat interface with the selected text as a query
7. AI agent processes the query with page context

---

## 4.5 Options Page

### 4.5.1 Overview

The extension currently uses an inline settings panel within the side panel rather than a separate options page. A dedicated options page is planned for v2.0:

| Property                         | Value                                                     |
| -------------------------------- | --------------------------------------------------------- |
| Status                           | Planned (v2.0)                                            |
| Access                           | `chrome://extensions > AGI Workforce > Extension options` |
| Settings currently in side panel | Bridge URL, API key                                       |

### 4.5.2 Planned Options Page Layout

```
┌──────────────────────────────────────────┐
│  AGI Workforce Extension Settings        │
│                                          │
│  CONNECTION                              │
│  ──────────────────────────────────────  │
│  Bridge URL:    [ws://localhost:8765  ]   │
│  Auto-connect:  [✓]                      │
│  Reconnect:     [✓] (exponential backoff)│
│                                          │
│  AUTHENTICATION                          │
│  ──────────────────────────────────────  │
│  API Key:       [••••••••••••] [Show]    │
│  Status:        ● Connected              │
│                                          │
│  JOB AUTOFILL                            │
│  ──────────────────────────────────────  │
│  Enable autofill:     [✓]               │
│  Auto-detect platform: [✓]              │
│  Profile:       [Edit Profile]           │
│                                          │
│  APPEARANCE                              │
│  ──────────────────────────────────────  │
│  Show FAB overlay:    [✓]               │
│  Theme:               [Dark ▼]           │
│                                          │
│  PRIVACY                                 │
│  ──────────────────────────────────────  │
│  Enable page context: [✓]               │
│  Max context chars:   [100000]           │
│  Send page HTML:      [✓]               │
│                                          │
│  ADVANCED                                │
│  ──────────────────────────────────────  │
│  Rate limit:    [120] requests/min       │
│  Screenshot cooldown: [500] ms           │
│  Debug logging: [✗]                      │
│                                          │
│  [Reset to Defaults]  [Save]             │
└──────────────────────────────────────────┘
```

---

# Section 5: Component Architecture

## 5.1 Manifest V3 Structure

```
dist/
├── manifest.json                 # Extension manifest (V3)
├── icons/
│   ├── icon16.png               # Toolbar icon (16x16)
│   ├── icon48.png               # Extension management page (48x48)
│   └── icon128.png              # Chrome Web Store (128x128)
├── src/
│   ├── background.js            # Service worker (background)
│   ├── content.js               # Content script (injected into pages)
│   ├── popup.html               # Popup page (toolbar click)
│   ├── popup.js                 # Popup script
│   ├── side_panel.html          # Side panel page
│   └── side_panel.js            # Side panel script
└── assets/                      # Bundled assets (if any)
```

## 5.2 Source Code Structure

```
apps/extension/
├── manifest.json                 # Chrome Extension Manifest V3
├── package.json                  # Package config (@agiworkforce/extension)
├── vite.config.ts                # Vite build configuration
├── vitest.config.ts              # Test configuration
├── tsconfig.json                 # TypeScript configuration
├── .eslintrc.cjs                 # ESLint configuration
├── .gitignore                    # Git ignore rules
├── icons/                        # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background.ts            # Service worker (1,100+ lines)
│   ├── content.ts               # Content script (1,400+ lines)
│   ├── popup.ts                 # Popup UI logic (322 lines)
│   ├── popup.html               # Popup HTML (372 lines)
│   ├── side_panel.ts            # Side panel chat (1,371 lines)
│   ├── side_panel.html          # Side panel HTML shell (24 lines)
│   ├── types.ts                 # Shared type definitions (838 lines)
│   ├── utils.ts                 # Shared utilities (492 lines)
│   ├── jobAutofill.ts           # Job autofill entry point
│   ├── injected.js              # Injected script for page context
│   ├── jobAutofill.runtime.js   # Runtime job autofill (legacy)
│   ├── jobAutofill.runtime.d.ts # Type declarations for runtime
│   └── autofill/                # Modular autofill system
│       ├── index.ts             # Barrel exports
│       ├── detector.ts          # Platform detection (409 lines)
│       ├── filler.ts            # Field filling (500+ lines)
│       ├── linkedin.ts          # LinkedIn-specific selectors and logic
│       └── lever.ts             # Lever-specific selectors and logic
├── __tests__/                    # Test files
│   ├── background.cookies.test.ts
│   ├── background.reconnect.test.ts
│   ├── jobAutofill.runtime.test.ts
│   └── sidePanelMarkdown.test.ts
└── dist/                         # Build output
```

## 5.3 Service Worker (`background.ts`)

### 5.3.1 Responsibilities

The background service worker is the central coordination hub:

1. **Native Messaging Bridge** — Establishes and maintains persistent connection to desktop app
2. **Message Routing** — Routes messages between popup, content scripts, side panel, and desktop
3. **Screenshot Capture** — Uses `chrome.tabs.captureVisibleTab()` for visible tab screenshots
4. **Tab Management** — Handles tab creation, closing, switching via Chrome Tabs API
5. **Cookie Operations** — Read, write, clear cookies via Chrome Cookies API
6. **Context Menu** — Registers and handles right-click context menu items
7. **Context Sync** — Syncs page context to desktop on tab changes and text selections
8. **Keep-Alive** — Alarm-based keep-alive to prevent service worker termination
9. **Rate Limiting** — Enforces per-tab message rate limits
10. **Page Action Orchestration** — Sends page context to desktop, receives action plan, executes via content script
11. **Chat Streaming** — Routes chat messages between side panel and AI backend

### 5.3.2 State Management

```typescript
interface BackgroundState {
  isNativeConnected: boolean; // Native messaging port is open
  nativePort: chrome.runtime.Port | null; // Active port to native host
  connectionStatus: ConnectionStatus; // 'connected' | 'disconnected' | 'connecting' | 'error'
  lastNativeError: string | null; // Last error message from native host
  rateLimiter: RateLimiter; // Per-tab rate limiting instance
  messageQueue: ExtensionMessage[]; // Queue for messages when disconnected
  isProcessingQueue: boolean; // Queue processing lock
}
```

### 5.3.3 Lifecycle

```
Install/Update → onInstalled handler
  ├── Register context menu items
  ├── Set up keep-alive alarm (60s interval)
  └── Attempt native messaging connection

Service Worker Activated → onStartup handler
  ├── Load configuration from chrome.storage.local
  ├── Attempt native messaging connection
  └── Start keep-alive alarm

Tab Updated → onUpdated handler
  ├── Capture page context
  ├── Dedup against last sync (5s cooldown, fingerprint hash)
  └── Send SYNC_PAGE_CONTEXT to native host

Tab Activated → onActivated handler
  ├── Capture page context for new active tab
  └── Send SYNC_PAGE_CONTEXT to native host

Alarm Fired → onAlarm handler
  ├── If keep-alive alarm: send PING to native host
  └── If native port dead: attempt reconnection

Message Received → onMessage handler
  ├── Route to appropriate handler based on message type
  ├── Forward to content script if DOM operation
  ├── Forward to native host if desktop operation
  └── Forward to side panel if chat response

Native Port Disconnected → onDisconnect handler
  ├── Update connection status
  ├── Classify error (terminal vs retryable)
  ├── Start exponential backoff reconnection (if retryable)
  └── Notify popup and side panel of status change
```

### 5.3.4 Native Messaging Connection

```typescript
// Connection establishment
function connectToNative(): void {
  state.nativePort = chrome.runtime.connectNative('com.agiworkforce.browser');
  state.nativePort.onMessage.addListener(handleNativeMessage);
  state.nativePort.onDisconnect.addListener(handleNativeDisconnect);
  state.connectionStatus = 'connected';
  state.isNativeConnected = true;
}

// Auto-reconnect policy
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000];
const TERMINAL_ERRORS = ['host_not_found', 'access_denied'];
```

### 5.3.5 Message Flow: Content Script Communication

```
Background ─sendMessage(tabId, msg)─► Content Script
Content Script ─sendResponse(result)─► Background
```

The background uses `chrome.tabs.sendMessage(tabId, message)` to send commands to the content script in a specific tab. The content script processes the command and returns the result via the `sendResponse` callback.

### 5.3.6 Message Flow: Side Panel Chat

```
Side Panel ─sendMessage(CHAT_MESSAGE)─► Background
Background ─native port / REST API────► AI Backend
AI Backend ─streaming response─────────► Background
Background ─sendMessage(CHAT_CHUNK)────► Side Panel
```

Chat messages flow through the background as a relay:

1. Side panel sends `CHAT_MESSAGE` to background
2. Background forwards to desktop app (via native messaging) or direct API
3. Streaming response chunks arrive as `CHAT_CHUNK` messages
4. Background forwards chunks to the side panel via `chrome.runtime.sendMessage()`

## 5.4 Content Script (`content.ts`)

### 5.4.1 Responsibilities

1. **DOM Interaction** — Execute click, type, scroll, and other DOM operations
2. **Page Context Capture** — Gather URL, title, HTML, selected text
3. **Form Detection and Filling** — Detect forms, map fields, fill values
4. **Job Application Autofill** — Platform-specific autofill for LinkedIn, Lever
5. **Element Capture** — Screenshot elements via canvas
6. **Accessibility Tree** — Build and return accessibility tree
7. **Action Recording** — Record user interactions for replay
8. **UI Injection** — Inject FAB overlay and automation indicator
9. **Pointer Tracking** — Track last pointer target for context menu actions

### 5.4.2 Initialization

```typescript
function initialize(): void {
  // 1. Add automation indicator to page
  addAutomationIndicator();

  // 2. Inject floating overlay button via shadow DOM
  injectFloatingOverlay();

  // 3. Set up message listener
  chrome.runtime.onMessage.addListener(handleMessage);

  // 4. Set up pointer tracking for context menu
  document.addEventListener('pointerdown', (e) => {
    lastPointerTarget = e.target as Element;
  });
}
```

### 5.4.3 HTML Context Size Limit

The content script caps the HTML context sent to the background at `MAX_CONTEXT_HTML_CHARS = 100,000` characters. This prevents excessive memory usage when syncing large pages.

## 5.5 Side Panel (`side_panel.ts`)

### 5.5.1 Architecture

The side panel is a standalone TypeScript application with no framework dependencies:

- **No React, Vue, or Angular** — Pure DOM manipulation for minimal bundle size
- **CSS injected via `<style>` tag** — All styles defined in `injectStyles()` function
- **HTML built programmatically** — `buildUI()` constructs the entire DOM tree
- **Message passing** — `chrome.runtime.onMessage` for streaming chat chunks
- **Storage** — `chrome.storage.local` for messages, `chrome.storage.session` for API key

### 5.5.2 Key Functions

| Function                                | Purpose                                               |
| --------------------------------------- | ----------------------------------------------------- |
| `injectStyles()`                        | Inject all CSS into document head                     |
| `buildUI()`                             | Construct the full UI DOM tree                        |
| `renderMessages()`                      | Incremental DOM update for message list               |
| `buildBubble(msg)`                      | Create message bubble DOM element                     |
| `renderMarkdown(text)`                  | Convert markdown to HTML (regex-based)                |
| `sanitizeHtml(dirty)`                   | Strip dangerous elements/attributes (DOMParser-based) |
| `sendMessage(text)`                     | Send user message to background, initiate streaming   |
| `handleStreamError(id, error)`          | Display error bubble                                  |
| `showThinking()` / `removeThinking()`   | Manage thinking dots animation                        |
| `updateStreamingBubble(id, text, done)` | Update assistant bubble during streaming              |
| `capturePageContext()`                  | Execute script in active tab to capture page text     |
| `setupVoiceInput(btn, input)`           | Wire Web Speech API to mic button                     |
| `saveMessages()` / `loadMessages()`     | Persist/load conversation from storage                |
| `saveApiKey(key)` / `loadApiKey()`      | Persist/load API key from session storage             |
| `scrollToBottom()`                      | Scroll messages area to bottom                        |
| `autoResizeInput(ta)`                   | Auto-grow textarea to content height                  |
| `formatTime(ts)`                        | Format timestamp as HH:MM                             |

### 5.5.3 Persistence Strategy

| Data             | Storage                                                 | Limit       | Lifetime                                   |
| ---------------- | ------------------------------------------------------- | ----------- | ------------------------------------------ |
| Chat messages    | `chrome.storage.local` (key: `agi_side_panel_messages`) | 50 messages | Until user clears or extension reinstalled |
| API key          | `chrome.storage.session` (key: `agi_api_key`)           | 1 key       | Cleared on browser close                   |
| Bridge URL       | `chrome.storage.local` (key: `agi_bridge_url`)          | 1 URL       | Persistent                                 |
| Extension config | `chrome.storage.local` (key: `config`)                  | 1 object    | Persistent                                 |
| Stats            | `chrome.storage.local` (key: `stats`)                   | 1 object    | Persistent                                 |
| Connection state | `chrome.storage.local` (key: `connectedToDesktop`)      | 1 boolean   | Persistent                                 |
| Autofill profile | `chrome.storage.local` (key: `agi_autofill_profile`)    | 1 object    | Persistent                                 |

## 5.6 Popup (`popup.ts` + `popup.html`)

### 5.6.1 Architecture

The popup is a traditional HTML page with a TypeScript module:

- **Static HTML** — Layout defined in `popup.html` with inline CSS
- **TypeScript module** — `popup.ts` handles dynamic behavior
- **No framework** — Plain DOM manipulation
- **State** — Simple `PopupState` object (session start time, action count, connection status)

### 5.6.2 Communication Pattern

```
Popup ──sendMessage({type: 'GET_CONNECTION_STATUS'})──► Background
Popup ──sendMessage({type: 'CAPTURE_SCREENSHOT'})──► Background
Background ──response──► Popup (via sendResponse callback)
```

## 5.7 Autofill Module (`src/autofill/`)

### 5.7.1 Architecture

The autofill system is organized into four modules:

```
autofill/
├── index.ts      # Barrel exports
├── detector.ts   # Platform detection + field enumeration
├── filler.ts     # Field value injection + React/Vue compatibility
├── linkedin.ts   # LinkedIn Easy Apply selectors + helpers
└── lever.ts      # Lever application selectors + helpers
```

### 5.7.2 Detection Pipeline

```
detectJobApplication()
  ├── Check URL against LinkedIn patterns (linkedin.com/jobs/, linkedin.com/job/)
  │   ├── Find LinkedIn form container (modal selectors, form heuristics)
  │   └── Detect fields (input/textarea/select, file inputs)
  ├── Check URL against Lever patterns (jobs.lever.co/, app.lever.co/*/apply)
  │   ├── Find Lever form container (.application-form, #application-form, etc.)
  │   └── Detect fields
  └── Return: { platform, isJobApplication, fields: DetectedField[] }
```

### 5.7.3 Field Detection

Each detected field includes:

| Property    | Type    | Description                                                        |
| ----------- | ------- | ------------------------------------------------------------------ |
| `key`       | string  | Normalized profile key (e.g., "firstName", "email", "linkedinUrl") |
| `selector`  | string  | CSS selector to target the element                                 |
| `label`     | string  | Human-readable label extracted from page                           |
| `fieldType` | enum    | "text", "email", "tel", "textarea", "select", "file", "other"      |
| `required`  | boolean | Whether the field is marked required                               |

### 5.7.4 Profile Key Mapping

The detector maps field labels to profile keys using regex patterns:

| Pattern                                       | Profile Key           |
| --------------------------------------------- | --------------------- |
| `first.?name`, `given.?name`                  | `firstName`           |
| `last.?name`, `surname`, `family.?name`       | `lastName`            |
| `^name$`, `full.?name`, `your name`           | `fullName`            |
| `e.?mail`                                     | `email`               |
| `phone`, `mobile`, `cell`                     | `phone`               |
| `city`                                        | `locationCity`        |
| `state`, `province`                           | `locationState`       |
| `country`                                     | `locationCountry`     |
| `linkedin`                                    | `linkedinUrl`         |
| `github`                                      | `githubUrl`           |
| `portfolio`, `personal.?site`, `website`      | `portfolioUrl`        |
| `company`, `employer`, `organization`         | `currentCompany`      |
| `title`, `position`, `role`                   | `currentTitle`        |
| `years?.* exp`, `experience.* years?`         | `yearsOfExperience`   |
| `authoriz`, `eligib`, `work.* permit`         | `workAuthorization`   |
| `sponsor`                                     | `requiresSponsorship` |
| `salary`, `compensation`, `pay`               | `salaryExpectation`   |
| `cover.?letter`, `motivation`, `introduction` | `coverLetterText`     |
| `resume`, `cv` (textarea)                     | `resumeText`          |
| `cover.?letter` (file)                        | `files.coverLetter`   |
| `resume`, `cv`, `curriculum` (file)           | `files.resume`        |

## 5.8 Shared Types (`types.ts`)

### 5.8.1 Message Type Union

All extension messages are type-safe via discriminated unions:

```typescript
type NativeMessageType =
  | 'CAPTURE_SCREENSHOT'
  | 'CLICK'
  | 'DOUBLE_CLICK'
  | 'RIGHT_CLICK'
  | 'TYPE'
  | 'GET_TEXT'
  | 'GET_ATTRIBUTE'
  | 'SET_ATTRIBUTE'
  | 'WAIT_FOR_SELECTOR'
  | 'EXECUTE_SCRIPT'
  | 'GET_PAGE_INFO'
  | 'GET_FORMS'
  | 'FILL_FORM'
  | 'SUBMIT_FORM'
  | 'GET_CONNECTION_STATUS'
  | 'CONNECTION_STATUS_CHANGED'
  | 'TAB_READY'
  | 'SYNC_PAGE_CONTEXT'
  | 'RUN_PAGE_ACTIONS'
  | 'CAPTURE_ELEMENT'
  | 'GET_ELEMENT_INFO'
  | 'AUTO_FILL_JOB_APPLICATION'
  | 'queue_message'
  | 'CHAT_MESSAGE'
  | 'open_side_panel'
  | 'GET_COOKIES'
  | 'SET_COOKIE'
  | 'CLEAR_COOKIES'
  | 'GET_ALL_TABS'
  | 'CREATE_TAB'
  | 'CLOSE_TAB'
  | 'SWITCH_TAB'
  | 'GET_ACCESSIBILITY_TREE'
  | 'BUILD_ACCESSIBILITY_TREE'
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'GET_RECORDED_ACTIONS'
  | 'SELECT_OPTION'
  | 'CHECK'
  | 'UNCHECK'
  | 'FOCUS'
  | 'BLUR'
  | 'HOVER'
  | 'SCROLL'
  | 'DRAG_DROP'
  | 'CLICK_AT_COORDINATES'
  | 'BRIDGE_URL_CHANGED';
```

### 5.8.2 Internal Message Types

Messages that stay within the extension (not sent to native host):

```typescript
type InternalMessageType = 'CHAT_CHUNK';
```

### 5.8.3 Key Interfaces

```typescript
interface ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

interface ExtensionConfig {
  desktopAppPort: number;     // Default: 8787
  desktopAppUrl: string;      // Default: http://localhost:8787
  enableLogging: boolean;     // Default: true
  maxRetries: number;         // Default: 3
  retryDelayMs: number;       // Default: 1000
  requestTimeoutMs: number;   // Default: 30000
}

interface PopupState {
  sessionStartTime: number;
  actionCount: number;
  isConnected: boolean;
}

interface AutomationState {
  isControlled: boolean;
  highlightedElement: Element | null;
  isRecording: boolean;
  recordedActions: RecordedAction[];
  connectionStatus: ConnectionStatus;
}

interface JobApplicationProfile {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  locationCity?: string;
  locationState?: string;
  locationCountry?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  websiteUrl?: string;
  currentCompany?: string;
  currentTitle?: string;
  yearsOfExperience?: string;
  workAuthorization?: string;
  requiresSponsorship?: boolean | string;
  salaryExpectation?: string;
  resumeText?: string;
  coverLetterText?: string;
  customAnswers?: Record<string, string>;
  files?: JobApplicationFiles;
}
```

## 5.9 Shared Utilities (`utils.ts`)

### 5.9.1 Configuration

```typescript
const DEFAULT_CONFIG: ExtensionConfig = {
  desktopAppPort: 8787,
  desktopAppUrl: 'http://localhost:8787',
  enableLogging: true,
  maxRetries: 3,
  retryDelayMs: 1000,
  requestTimeoutMs: 30000,
};
```

### 5.9.2 Utility Classes and Functions

| Utility                     | Type     | Description                                                                  |
| --------------------------- | -------- | ---------------------------------------------------------------------------- |
| `logger`                    | Object   | Conditional logging (debug, info, warn, error) with `[AGI Workforce]` prefix |
| `sleep(ms)`                 | Function | Promise-based delay                                                          |
| `retry(fn, retries, delay)` | Function | Exponential backoff retry wrapper                                            |
| `withTimeout(promise, ms)`  | Function | Promise timeout wrapper (30s default)                                        |
| `RateLimiter`               | Class    | Per-tab rate limiting (120/min, 500ms screenshot cooldown)                   |
| `domUtils`                  | Object   | Safe DOM query, click, text, visibility checking                             |
| `formUtils`                 | Object   | Form detection, field enumeration, filling, submission                       |
| `storageUtils`              | Object   | chrome.storage.local get/set/remove/clear                                    |
| `validators`                | Object   | URL safety, selector validation, XSS sanitization                            |

---

# Section 6: Data Flow & API Connections

## 6.1 Native Messaging Bridge Protocol

### 6.1.1 Protocol Overview

Communication between the browser extension and the AGI Workforce desktop app uses Chrome Native Messaging:

| Property         | Value                                |
| ---------------- | ------------------------------------ |
| Transport        | Standard I/O (stdin/stdout)          |
| Protocol         | Length-prefixed JSON                 |
| Encoding         | UTF-8                                |
| Max message size | 1 MB (Chrome limit)                  |
| Host name        | `com.agiworkforce.browser`           |
| Connection type  | Persistent (one per browser session) |

### 6.1.2 Message Format

```
┌─────────────────────────────────────┐
│ 4 bytes (little-endian uint32)      │  ← Message length
├─────────────────────────────────────┤
│ JSON payload (UTF-8)                │  ← Message body
└─────────────────────────────────────┘
```

### 6.1.3 Request Envelope

Every message sent from the extension to the desktop app is wrapped in a request envelope:

```typescript
interface NativeRequest {
  id: string; // Unique request ID for response correlation
  message: NativeMessage; // The actual message payload
}
```

### 6.1.4 Response Envelope

Every response from the desktop app:

```typescript
interface NativeResponse {
  id: string; // Matches the request ID
  success: boolean; // Whether the operation succeeded
  data?: any; // Response data (on success)
  error?: string; // Error message (on failure)
}
```

### 6.1.5 Message Types (Extension → Desktop)

| Category               | Message Type           | Fields                                                                        | Description                 |
| ---------------------- | ---------------------- | ----------------------------------------------------------------------------- | --------------------------- |
| **Connection**         | `Connect`              | `extension_id`                                                                | Initial handshake           |
|                        | `Disconnect`           | `reason?`                                                                     | Graceful disconnect         |
|                        | `Ping`                 | —                                                                             | Keep-alive                  |
| **Browser Automation** | `Click`                | `selector, tab_id?`                                                           | Click element               |
|                        | `Type`                 | `selector, text, tab_id?`                                                     | Type text into element      |
|                        | `Navigate`             | `url, tab_id?`                                                                | Navigate to URL             |
|                        | `Screenshot`           | `tab_id?, format?`                                                            | Capture screenshot          |
|                        | `Hover`                | `selector, tab_id?`                                                           | Hover over element          |
|                        | `WaitForSelector`      | `selector, timeout_ms?, tab_id?`                                              | Wait for element            |
|                        | `SelectOption`         | `selector, value, tab_id?`                                                    | Select dropdown option      |
|                        | `SetChecked`           | `selector, checked, tab_id?`                                                  | Set checkbox state          |
|                        | `Focus`                | `selector, tab_id?`                                                           | Focus element               |
|                        | `ScrollIntoView`       | `selector, tab_id?`                                                           | Scroll element into view    |
| **DOM Operations**     | `GetElement`           | `selector, tab_id?`                                                           | Get element descriptor      |
|                        | `GetElements`          | `selector, tab_id?`                                                           | Get all matching elements   |
|                        | `GetText`              | `selector, tab_id?`                                                           | Get element text            |
|                        | `GetAttribute`         | `selector, attribute, tab_id?`                                                | Get element attribute       |
|                        | `SetAttribute`         | `selector, attribute, value, tab_id?`                                         | Set element attribute       |
| **Accessibility**      | `GetAccessibilityTree` | `tab_id?`                                                                     | Get page accessibility tree |
|                        | `GetFocusableElements` | `tab_id?`                                                                     | Get focusable elements      |
| **Tab Management**     | `GetTabs`              | —                                                                             | List all tabs               |
|                        | `GetActiveTab`         | —                                                                             | Get active tab info         |
|                        | `CreateTab`            | `url`                                                                         | Open new tab                |
|                        | `CloseTab`             | `tab_id`                                                                      | Close tab                   |
|                        | `SwitchTab`            | `tab_id`                                                                      | Activate tab                |
| **Cookies**            | `GetCookies`           | `url?`                                                                        | Read cookies                |
|                        | `SetCookie`            | `cookie: CookieData`                                                          | Set cookie                  |
|                        | `GetLocalStorage`      | `key?, tab_id?`                                                               | Read localStorage           |
|                        | `SetLocalStorage`      | `key, value, tab_id?`                                                         | Write localStorage          |
| **Page Info**          | `GetPageInfo`          | `tab_id?`                                                                     | Get page metadata           |
|                        | `GetPageContent`       | `tab_id?`                                                                     | Get full page content       |
|                        | `PageContext`          | `url, title, html, selected_text?, tab_id, timestamp`                         | Sync page context           |
|                        | `TaskResult`           | `task_id, success, screenshot?, result?, error?, actions_performed, duration` | Report task completion      |
|                        | `SelectedTextQuery`    | `selected_text, url?, tab_id?`                                                | Selected text query         |
| **Scripting**          | `ExecuteScript`        | `script, tab_id?`                                                             | Execute named operation     |

### 6.1.6 Message Types (Desktop → Extension)

| Message Type | Fields                       | Description                          |
| ------------ | ---------------------------- | ------------------------------------ |
| `Pong`       | —                            | Keep-alive response                  |
| `Response`   | `id, success, data?, error?` | Generic response to any request      |
| `Click`      | `selector, tab_id?`          | Desktop-initiated click command      |
| `Type`       | `selector, text, tab_id?`    | Desktop-initiated type command       |
| `Navigate`   | `url, tab_id?`               | Desktop-initiated navigation         |
| `Screenshot` | `tab_id?, format?`           | Desktop-initiated screenshot request |

## 6.2 Chrome Storage API Usage

### 6.2.1 Storage Areas

| Storage Area             | Usage                                                 | Lifetime                     | Size Limit        |
| ------------------------ | ----------------------------------------------------- | ---------------------------- | ----------------- |
| `chrome.storage.local`   | Messages, config, stats, autofill profile, bridge URL | Persistent (until uninstall) | 5MB (QUOTA_BYTES) |
| `chrome.storage.session` | API keys                                              | Cleared on browser close     | 1MB               |

### 6.2.2 Storage Keys

| Key                       | Storage Area                         | Type                      | Description                              |
| ------------------------- | ------------------------------------ | ------------------------- | ---------------------------------------- |
| `agi_side_panel_messages` | local                                | `ChatMessage[]`           | Side panel conversation history (max 50) |
| `agi_api_key`             | session (primary), local (migration) | `string`                  | API key for direct AI access             |
| `agi_bridge_url`          | local                                | `string`                  | WebSocket bridge URL override            |
| `config`                  | local                                | `ExtensionConfig`         | Extension configuration                  |
| `stats`                   | local                                | `{ actionCount: number }` | Automation action counter                |
| `connectedToDesktop`      | local                                | `boolean`                 | Desktop connection status                |
| `agi_autofill_profile`    | local                                | `JobApplicationProfile`   | Saved job application profile            |

### 6.2.3 Storage Migration

The extension migrates API keys from `chrome.storage.local` to `chrome.storage.session`:

```
On loadApiKey():
  1. Check chrome.storage.session for key
  2. If found: return key
  3. If not found: check chrome.storage.local (legacy)
  4. If legacy key found:
     a. Copy to chrome.storage.session
     b. Delete from chrome.storage.local
     c. Return key
  5. If no key found anywhere: return null
```

## 6.3 REST API Fallback

When the desktop app is not connected (native messaging unavailable), the side panel chat can operate in standalone mode:

### 6.3.1 Standalone Chat Flow

```
Side Panel ──CHAT_MESSAGE──► Background
Background:
  1. Check if native port is connected
  2. If connected: forward to desktop (full agent capabilities)
  3. If NOT connected: use direct API call
     a. Read API key from message payload
     b. Call cloud LLM API directly (e.g., Anthropic, OpenAI)
     c. Stream response back as CHAT_CHUNK messages
```

### 6.3.2 API Request Format (Standalone Mode)

```typescript
// Example: Direct Anthropic API call from background
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    stream: true,
    messages: [
      // conversation history
      ...conversationHistory,
      // current message with optional page context
      {
        role: 'user',
        content: pageContext ? `[Page context: ${pageContext}]\n\n${userText}` : userText,
      },
    ],
  }),
});
```

## 6.4 Context Sync Protocol

### 6.4.1 Sync Triggers

| Trigger        | Event                                        | Debounce                           |
| -------------- | -------------------------------------------- | ---------------------------------- |
| Tab activated  | `chrome.tabs.onActivated`                    | 5s cooldown with fingerprint dedup |
| Tab updated    | `chrome.tabs.onUpdated` (status: complete)   | 5s cooldown                        |
| Text selected  | Selection change event (via content script)  | 5s cooldown                        |
| Manual capture | User clicks "Add page context" in side panel | No debounce                        |

### 6.4.2 Sync Payload

```typescript
interface PageContextSync {
  url: string;
  title: string;
  html: string; // Truncated to MAX_CONTEXT_HTML_CHARS (100,000)
  selectedText?: string;
  timestamp: number;
  tabId: number;
}
```

### 6.4.3 Deduplication

```
Fingerprint = hash(url + title + selectedText)
If fingerprint == lastSyncFingerprint AND (now - lastSyncTime) < 5000ms:
  → Discard (duplicate)
Else:
  → Send sync, update lastSyncFingerprint and lastSyncTime
```

## 6.5 Page Action Orchestration Flow

When the desktop agent wants to perform actions on a web page:

```
1. Desktop agent decides to interact with browser
2. Desktop sends action plan to extension via native messaging:
   {
     type: "RUN_PAGE_ACTIONS",
     taskId: "task-abc123",
     actions: [
       { id: "1", type: "click", selector: "#login-btn" },
       { id: "2", type: "wait", selector: ".dashboard", delay: 2000 },
       { id: "3", type: "type", selector: "#search", value: "query text" }
     ]
   }
3. Background forwards to content script in active tab
4. Content script executes actions sequentially with delays
5. Content script reports result:
   {
     success: true,
     taskId: "task-abc123",
     actionsPerformed: 3,
     duration: 4200,
     screenshot: "data:image/png;base64,..."
   }
6. Background forwards result to desktop via native messaging
```

## 6.6 Auth and Session Management

### 6.6.1 API Key Lifecycle

```
┌─────────────────┐
│ User enters key  │
│ in side panel    │
└───────┬─────────┘
        │
        ▼
┌─────────────────────────────┐
│ Save to chrome.storage.session │
│ (cleared on browser close)    │
└───────┬─────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ On subsequent page load:            │
│ 1. Check chrome.storage.session     │
│ 2. If empty: check .local (migrate) │
│ 3. Set currentApiKey in memory      │
│ 4. Update connection status pill     │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ On chat message send:        │
│ Attach apiKey to message     │
│ Background uses for API call │
└──────────────────────────────┘
```

### 6.6.2 Desktop Bridge Authentication

When connected to the desktop app via native messaging, authentication is implicit — the native messaging host validates the extension ID in the manifest's `allowed_origins` list. No additional API key is needed for the desktop bridge.

## 6.7 Offline Behavior

| Scenario                        | Behavior                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Desktop app not running         | Side panel works with direct API key; DOM automation unavailable                                    |
| No internet + desktop running   | Desktop app routes to local LLMs (Ollama, LM Studio); side panel chat works through desktop bridge  |
| No internet + no desktop        | Extension is non-functional; displays "Not Connected" in popup and side panel                       |
| Desktop disconnects mid-session | Background queues messages (up to 1,000); triggers auto-reconnect; side panel shows "Not Connected" |

---

# Section 7: Platform-Specific Capabilities

## 7.1 Page Context Capture

### 7.1.1 Capture Methods

| Method                 | Trigger                           | Content                              | Size Limit     |
| ---------------------- | --------------------------------- | ------------------------------------ | -------------- |
| Full page HTML         | SYNC_PAGE_CONTEXT / GET_PAGE_INFO | `document.documentElement.outerHTML` | 100,000 chars  |
| Selected text          | Text selection + tab change       | `window.getSelection().toString()`   | Unlimited      |
| Visible tab screenshot | CAPTURE_SCREENSHOT                | PNG/JPEG/WebP image data             | Chrome default |
| Element screenshot     | CAPTURE_ELEMENT                   | Canvas capture of specific element   | Element size   |
| Body text (side panel) | "Add page context" button         | `document.body.innerText`            | 5,000 chars    |

### 7.1.2 Screenshot Formats

| Format | Quality      | Use Case                             |
| ------ | ------------ | ------------------------------------ |
| PNG    | Lossless     | Default, best for text-heavy pages   |
| JPEG   | 90% quality  | Smaller file size, photo-heavy pages |
| WebP   | Configurable | Best compression, modern browsers    |

## 7.2 Form Autofill System

### 7.2.1 Platform Detection Logic

```typescript
function detectJobApplication(): DetectionResult {
  const url = window.location.href;

  // LinkedIn: linkedin.com/jobs/ or linkedin.com/job/
  if (/linkedin\.com\/jobs?\//i.test(url)) {
    // Look for Easy Apply modal or inline form
    return detectLinkedInApplication();
  }

  // Lever: jobs.lever.co/ or app.lever.co/*/apply
  if (/jobs\.lever\.co\/|app\.lever\.co\/.*\/apply/i.test(url)) {
    return detectLeverApplication();
  }

  // Greenhouse: boards.greenhouse.io (planned)
  // Workday: *.myworkdayjobs.com (planned)

  return { platform: null, isJobApplication: false, fields: [] };
}
```

### 7.2.2 LinkedIn Easy Apply Integration

**Modal Selectors:**

- `.jobs-easy-apply-modal`
- `.jobs-apply-modal`
- `[data-test-modal-id="easy-apply-modal"]`
- `.artdeco-modal--layer-default`
- `.jobs-easy-apply-content`
- `div[aria-label*="Apply"]`
- `div[aria-label*="apply"]`

**Field Detection:** The detector scans the modal for `<input>`, `<textarea>`, and `<select>` elements (excluding hidden, submit, button, checkbox, and radio types). For each field:

1. Find label via `<label for="...">`, `aria-label`, `aria-labelledby`, wrapping `<label>`, placeholder, or parent text
2. Map label to profile key using regex patterns
3. Generate CSS selector (by ID, name, data-test attribute, or position)

**Multi-Step Navigation:** LinkedIn Easy Apply often spans multiple pages. The extension detects the "Next" button and can advance through steps up to `maxSubmitSteps` (default: 3).

### 7.2.3 Lever Application Integration

**Form Selectors:**

- `.application-form`
- `#application-form`
- `form[action*="apply"]`
- `.lever-application`
- `[data-qa="application-form"]`
- `.posting-apply`

**Custom Field Detection:** Lever forms include custom fields defined by the employer. The `detectLeverCustomFields()` function enumerates these and maps them to generic profile keys where possible.

**EEO (Equal Employment Opportunity) Fields:** Lever includes optional EEO demographic questions. These are detected via `LEVER_EEO_SELECTORS` and can be optionally filled or skipped.

### 7.2.4 React/Vue Compatibility

Modern web frameworks (React, Vue, Angular) override native input value setters. The extension uses a compatibility layer:

```typescript
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // Bypass React's value descriptor override
  const nativeSet = Object.getOwnPropertyDescriptor(
    el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
    'value',
  )?.set;

  if (nativeSet) {
    nativeSet.call(el, value);
  } else {
    el.value = value;
  }
}

function dispatchFillEvents(el: HTMLElement): void {
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}
```

## 7.3 DOM Reading and Element Interaction

### 7.3.1 Element Selection

All DOM operations use CSS selectors. The extension validates selectors before use:

```typescript
function isValidSelector(selector: string): boolean {
  try {
    document.querySelector(selector);
    return true;
  } catch {
    return false;
  }
}
```

### 7.3.2 Safe Click

The extension dispatches proper MouseEvent objects and also calls `.click()` as a fallback:

```typescript
function safeClick(element: Element, button: 'left' | 'middle' | 'right' = 'left'): boolean {
  const mouseEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
    buttons: button === 'left' ? 1 : button === 'middle' ? 4 : 2,
  });
  element.dispatchEvent(mouseEvent);

  // Fallback: also call native click()
  if ('click' in element && typeof element.click === 'function') {
    (element as HTMLElement).click();
  }
}
```

### 7.3.3 Element Visibility Check

```typescript
function isVisible(element: Element | null): boolean {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}
```

## 7.4 Native Messaging to Desktop App

### 7.4.1 Host Registration

The desktop app registers a native messaging host during installation:

**macOS host manifest** (`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.agiworkforce.browser.json`):

```json
{
  "name": "com.agiworkforce.browser",
  "description": "AGI Workforce Native Host",
  "path": "/Applications/AGI Workforce.app/Contents/MacOS/agiworkforce-native",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://EXTENSION_ID/"]
}
```

**Windows registry** (`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.agiworkforce.browser`):

- Default value: path to `com.agiworkforce.browser.json`
- JSON file content same as macOS (with Windows executable path)

**Linux host manifest** (`~/.config/google-chrome/NativeMessagingHosts/com.agiworkforce.browser.json`):

- Same format as macOS (with Linux executable path)

### 7.4.2 Desktop-Side Implementation

The Rust native messaging host (`apps/desktop/src-tauri/src/integrations/native_messaging/`) implements:

| Module        | Lines  | Purpose                                                  |
| ------------- | ------ | -------------------------------------------------------- |
| `mod.rs`      | 404    | Message types, read/write functions, manifest generation |
| `host.rs`     | 19,157 | Host process main loop, message dispatching              |
| `manifest.rs` | 20,829 | Host manifest installation and management                |
| `messages.rs` | 7,151  | Message serialization/deserialization helpers            |

### 7.4.3 Message Flow Diagram

```
┌──────────────────┐     Chrome NM Protocol     ┌──────────────────┐
│  Browser          │    (stdin/stdout, JSON)    │  Desktop App     │
│  Extension        │ ◄═══════════════════════► │  (Tauri Rust)    │
│                   │                            │                   │
│  Service Worker   │ ──NativeRequest──────────► │  NM Host         │
│  (background.ts)  │                            │  (host.rs)       │
│                   │ ◄──NativeResponse────────  │                   │
│                   │                            │  ┌──────────────┐│
│  Content Script   │                            │  │ LLM Router   ││
│  (content.ts)     │                            │  │ Agent Engine  ││
│                   │                            │  │ ToolGuard     ││
│  Side Panel       │                            │  │ MCP Tools     ││
│  (side_panel.ts)  │                            │  └──────────────┘│
│                   │                            │                   │
│  Popup            │                            │                   │
│  (popup.ts)       │                            │                   │
└──────────────────┘                            └──────────────────┘
```

## 7.5 Manifest Permissions and Justifications

### 7.5.1 Required Permissions

| Permission        | Chrome API                     | Justification                                                                         | Privacy Impact                |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------- |
| `activeTab`       | `chrome.activeTab`             | Inspect and interact with the currently active tab for context capture and automation | Low — only active tab         |
| `tabs`            | `chrome.tabs`                  | Query tab metadata (URL, title) for context sync and multi-tab management             | Medium — can see all tab URLs |
| `storage`         | `chrome.storage`               | Persist extension settings, chat history, autofill profile                            | Low — local only              |
| `nativeMessaging` | `chrome.runtime.connectNative` | Connect to AGI Workforce desktop app for AI agent bridge                              | Low — local app only          |
| `alarms`          | `chrome.alarms`                | Keep-alive alarm to prevent service worker termination                                | None                          |
| `contextMenus`    | `chrome.contextMenus`          | Right-click context menu items for element capture and text queries                   | None                          |
| `sidePanel`       | `chrome.sidePanel`             | Display persistent AI chat sidebar in browser                                         | None                          |
| `scripting`       | `chrome.scripting`             | Execute content scripts for page context capture in side panel                        | Medium — script execution     |
| `cookies`         | `chrome.cookies`               | Read/write/clear cookies for AI-driven browser automation                             | Medium — cookie access        |

### 7.5.2 Optional Permissions (User-Granted on Demand)

| Permission  | Use Case                                           | When Requested                              |
| ----------- | -------------------------------------------------- | ------------------------------------------- |
| `downloads` | Save captured screenshots, generated files to disk | When user uses "Save capture" feature       |
| `bookmarks` | Bookmark management by AI agent                    | When agent needs to manage bookmarks        |
| `history`   | Browser history context for AI search and analysis | When user enables "Include history" setting |

### 7.5.3 Host Permissions

| Permission   | Scope                | Justification                                                        |
| ------------ | -------------------- | -------------------------------------------------------------------- |
| `<all_urls>` | All HTTP/HTTPS pages | Required for content script injection on any page for DOM automation |

## 7.6 Content Security Policy

### 7.6.1 Extension Pages CSP

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'"
  }
}
```

| Directive    | Value                    | Rationale                                                                             |
| ------------ | ------------------------ | ------------------------------------------------------------------------------------- |
| `script-src` | `'self'`                 | Only scripts packaged with the extension may execute; no inline, no eval, no external |
| `object-src` | `'self'`                 | Block Flash/Java plugin embeds from external sources                                  |
| `style-src`  | `'self' 'unsafe-inline'` | Allow inline styles for side panel (injected via `<style>` tag in `injectStyles()`)   |

### 7.6.2 Content Script CSP

Content scripts run in an isolated world separate from the page's CSP. They inherit the extension's CSP for their own scripts but can interact with the page DOM freely. The content script does NOT inject any `<script>` tags into the page.

## 7.7 Cross-Origin Considerations

### 7.7.1 Content Script Cross-Origin

Content scripts can access the DOM of any page regardless of CORS because they run in the extension's isolated world. However:

- **Cross-origin XMLHttpRequest/fetch** from content scripts: limited by CORS unless the extension has host permissions for the target origin
- **Cross-origin iframe access**: content scripts cannot access cross-origin iframes
- **postMessage**: content scripts can `postMessage` to the page and listen for responses

### 7.7.2 Background Service Worker Cross-Origin

The background service worker can make cross-origin requests to any URL that matches the extension's `host_permissions`. Since the extension declares `<all_urls>`, the background can fetch any URL without CORS restrictions.

This is used for:

- Direct API calls to LLM providers (when desktop is not connected)
- Page content fetching as a fallback

---

# Section 8: Build, Deploy & Distribution

## 8.1 Build Pipeline

### 8.1.1 Vite Build Configuration

The extension uses Vite with Rollup for bundling:

```typescript
// vite.config.ts
{
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'terser',          // Terser for production minification
    sourcemap: mode !== 'production',  // Source maps in dev only
    rollupOptions: {
      input: {
        background: 'src/background.ts',
        content: 'src/content.ts',
        popup: 'src/popup.ts',
        side_panel: 'src/side_panel.ts',
      },
      output: {
        // Preserve original file paths for manifest references
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'src/background.js';
          if (chunk.name === 'content') return 'src/content.js';
          if (chunk.name === 'popup') return 'src/popup.js';
          if (chunk.name === 'side_panel') return 'src/side_panel.js';
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: 'icons', dest: '.' },
        { src: 'src/popup.html', dest: 'src' },
        { src: 'src/side_panel.html', dest: 'src' },
      ],
    }),
  ],
}
```

### 8.1.2 Build Commands

| Command        | Description                                 | Output                                |
| -------------- | ------------------------------------------- | ------------------------------------- |
| `pnpm dev`     | Watch mode build (rebuilds on file changes) | `dist/` (with source maps)            |
| `pnpm build`   | Production build                            | `dist/` (minified, no source maps)    |
| `pnpm package` | Build + zip for distribution                | `extension.zip` (excludes .map files) |
| `pnpm clean`   | Remove build output                         | Deletes `dist/`                       |

### 8.1.3 Build Output Structure

```
dist/
├── manifest.json              # Copied from root
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background.js          # Service worker (minified)
│   ├── content.js             # Content script (minified)
│   ├── popup.html             # Popup page
│   ├── popup.js               # Popup script (minified)
│   ├── side_panel.html        # Side panel page
│   └── side_panel.js          # Side panel script (minified)
└── assets/                    # Any additional bundled assets
```

## 8.2 Chrome Web Store Submission

### 8.2.1 Submission Checklist

| Step | Requirement                                          | Status                   |
| ---- | ---------------------------------------------------- | ------------------------ |
| 1    | Developer account registered ($5 one-time fee)       | Required                 |
| 2    | Extension icons: 16x16, 48x48, 128x128 PNG           | Implemented              |
| 3    | Promotional images: 440x280 (small), 920x680 (large) | Required                 |
| 4    | Screenshot images: 1280x800 or 640x400               | Required (3-5)           |
| 5    | Description text (max 132 chars summary)             | Required                 |
| 6    | Detailed description                                 | Required                 |
| 7    | Privacy policy URL                                   | Required                 |
| 8    | Permission justification for each permission         | Required                 |
| 9    | Host permission justification (`<all_urls>`)         | Required (strict review) |
| 10   | Single-purpose description                           | Required                 |
| 11   | ZIP file under 500MB                                 | Implemented (~95KB)      |
| 12   | Manifest V3 (V2 being sunset)                        | Implemented              |

### 8.2.2 Permission Justification Statements (for Chrome Web Store Review)

| Permission        | Justification Statement                                                                                                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`       | "Required to capture the content and URL of the page the user is currently viewing, so the AI assistant can answer questions about the page."                                                                                                                                 |
| `tabs`            | "Required to show tab information in the popup status display and to manage tabs when the AI agent needs to navigate between pages."                                                                                                                                          |
| `storage`         | "Required to save the user's conversation history, autofill profile, and extension settings locally on their device."                                                                                                                                                         |
| `nativeMessaging` | "Required to communicate with the AGI Workforce desktop application for AI agent features including multi-model routing and tool execution."                                                                                                                                  |
| `alarms`          | "Required to maintain a keep-alive timer that prevents the service worker from being terminated by the browser, ensuring consistent native messaging connectivity."                                                                                                           |
| `contextMenus`    | "Required to add right-click menu items that allow users to capture page elements or ask AI questions about selected text."                                                                                                                                                   |
| `sidePanel`       | "Required to display a persistent AI chat sidebar alongside any web page, allowing users to ask questions and get AI assistance without leaving the page."                                                                                                                    |
| `scripting`       | "Required to capture the text content of the current page when the user clicks 'Add page context' in the AI chat sidebar."                                                                                                                                                    |
| `cookies`         | "Required for AI-driven browser automation workflows that need to read or manage cookies for authenticated web actions."                                                                                                                                                      |
| `<all_urls>`      | "Required because the extension's content script must be injected into any web page the user visits to provide DOM automation, form autofill, and page context capture features. The extension does not collect or transmit browsing data to any server without user action." |

### 8.2.3 Store Listing Content

**Name:** AGI Workforce Browser Automation

**Summary (132 chars max):** AI-powered browser automation: page context capture, job autofill, DOM interaction, and chat sidebar.

**Category:** Productivity

**Language:** English

## 8.3 Extension Signing

Chrome Web Store automatically signs extensions during the review and publication process. For enterprise distribution:

| Distribution Method | Signing                                             |
| ------------------- | --------------------------------------------------- |
| Chrome Web Store    | Automatic by Google                                 |
| Enterprise policy   | Self-signed CRX or Chrome Web Store private listing |
| Developer sideload  | Unsigned (requires Developer Mode)                  |

## 8.4 Update Mechanism

| Method             | Behavior                                                               |
| ------------------ | ---------------------------------------------------------------------- |
| Chrome Web Store   | Chrome auto-updates every ~5 hours (configurable by enterprise policy) |
| Enterprise policy  | Controlled via `ExtensionInstallForcelist` policy                      |
| Developer sideload | Manual reload via `chrome://extensions`                                |

### 8.4.1 Update Flow

```
1. Developer pushes new version to Chrome Web Store
2. Chrome checks for updates (every ~5 hours)
3. New version downloaded in background
4. Extension updated on next browser restart (or immediately if idle)
5. chrome.runtime.onInstalled fires with reason: 'update'
6. Background service worker re-initializes
7. Content scripts re-injected on next page load
```

### 8.4.2 Version Numbering

Follow Chrome Web Store versioning requirements:

- Format: `MAJOR.MINOR.PATCH` (e.g., 1.1.0)
- Must be incremented with each submission
- Cannot be decreased (Chrome rejects downgrades)

## 8.5 CI/CD Integration

### 8.5.1 Build Verification

```yaml
# In .github/workflows/ci.yml
extension-build:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v3
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
    - run: pnpm install
    - run: cd apps/extension && pnpm build
    - run: cd apps/extension && pnpm test
    - run: cd apps/extension && pnpm lint
```

### 8.5.2 Automated Store Publishing (Planned)

Using `chrome-webstore-upload` npm package:

1. CI builds the extension
2. CI creates ZIP package
3. CI uploads to Chrome Web Store via API
4. Manual review and publish by maintainer

---

# Section 9: Testing Strategy

## 9.1 Unit Testing

### 9.1.1 Test Framework

| Property      | Value                            |
| ------------- | -------------------------------- |
| Framework     | Vitest 4.0.18                    |
| DOM emulation | jsdom 27.4.0                     |
| Config        | `vitest.config.ts`               |
| Command       | `cd apps/extension && pnpm test` |

### 9.1.2 Existing Test Coverage

| Test File                      | Module                    | Tests                        | Description                                                           |
| ------------------------------ | ------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| `background.cookies.test.ts`   | Background service worker | Cookie API                   | Tests cookie read, write, clear operations                            |
| `background.reconnect.test.ts` | Background service worker | Reconnection                 | Tests exponential backoff reconnection logic                          |
| `jobAutofill.runtime.test.ts`  | Job autofill              | Platform detection + filling | Tests LinkedIn and Lever form detection, field mapping, and filling   |
| `sidePanelMarkdown.test.ts`    | Side panel                | Markdown rendering           | Tests markdown-to-HTML conversion including code blocks, lists, links |

### 9.1.3 Test Targets by Module

| Module                 | Priority | Test Focus                                                                |
| ---------------------- | -------- | ------------------------------------------------------------------------- |
| `background.ts`        | P0       | Native messaging lifecycle, message routing, reconnection, rate limiting  |
| `content.ts`           | P0       | DOM operations (click, type, scroll), element detection, message handling |
| `side_panel.ts`        | P0       | Chat flow, streaming, markdown rendering, HTML sanitization               |
| `popup.ts`             | P1       | Status display, capture flow, refresh flow                                |
| `types.ts`             | P1       | Message type discrimination, interface compliance                         |
| `utils.ts`             | P0       | Rate limiter, retry, timeout, DOM utils, form utils, validators           |
| `autofill/detector.ts` | P0       | Platform detection accuracy, field mapping correctness                    |
| `autofill/filler.ts`   | P0       | Fill accuracy, React compatibility, event dispatch                        |
| `autofill/linkedin.ts` | P1       | LinkedIn selector accuracy, multi-step navigation                         |
| `autofill/lever.ts`    | P1       | Lever selector accuracy, custom field detection                           |

### 9.1.4 Mock Strategy

| Chrome API                      | Mock Approach                                     |
| ------------------------------- | ------------------------------------------------- |
| `chrome.runtime.connectNative`  | Mock port object with `onMessage`, `onDisconnect` |
| `chrome.runtime.sendMessage`    | Mock with configurable response                   |
| `chrome.runtime.onMessage`      | Mock listener registration                        |
| `chrome.tabs.query`             | Mock with configurable tab list                   |
| `chrome.tabs.captureVisibleTab` | Mock with base64 image data                       |
| `chrome.tabs.sendMessage`       | Mock with configurable response                   |
| `chrome.storage.local`          | In-memory mock storage                            |
| `chrome.storage.session`        | In-memory mock storage                            |
| `chrome.contextMenus`           | Mock creation and click handlers                  |
| `chrome.alarms`                 | Mock alarm creation and firing                    |
| `chrome.sidePanel`              | Mock open/close                                   |
| `chrome.cookies`                | In-memory cookie store                            |

## 9.2 Integration Testing

### 9.2.1 Test Scenarios

| Scenario                      | Description                                                 | Priority |
| ----------------------------- | ----------------------------------------------------------- | -------- |
| End-to-end chat               | Send message → receive streaming response → verify rendered | P0       |
| Native messaging round-trip   | Extension → Desktop → Extension with DOM operation          | P0       |
| Job autofill on LinkedIn mock | Mock LinkedIn DOM → run detection → verify fills            | P0       |
| Job autofill on Lever mock    | Mock Lever DOM → run detection → verify fills               | P0       |
| Reconnection after disconnect | Disconnect native port → verify backoff → reconnect         | P0       |
| Page context capture          | Navigate to page → capture context → verify content         | P1       |
| Multi-tab management          | Create tabs → switch → close → verify state                 | P1       |
| Screenshot capture flow       | Trigger capture → verify image data returned                | P1       |
| Context menu actions          | Right-click → select action → verify message sent           | P1       |
| Storage migration             | Legacy local key → verify migrated to session               | P0       |

### 9.2.2 Integration Test Environment

```
Chrome (headless) with extension loaded
  ├── Test pages served by local HTTP server
  ├── Mock native messaging host (Node.js)
  ├── Mock AI API server (for standalone mode)
  └── Assertions via Chrome DevTools Protocol
```

## 9.3 End-to-End Testing

### 9.3.1 E2E Test Scenarios

| Scenario                                | Description                                                                        | Tools                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------- |
| Full workflow: search → capture → ask   | Navigate to page → capture context → ask question in side panel → verify answer    | Playwright + Chrome extension loading |
| Job application: detect → fill → verify | Navigate to mock job application → detect platform → fill fields → verify accuracy | Playwright + mock job portal          |
| Desktop bridge: agent automation        | Desktop agent sends actions → extension executes → results returned                | Playwright + Tauri test harness       |

### 9.3.2 E2E Test Matrix

| Browser | Version       | OS      | Priority |
| ------- | ------------- | ------- | -------- |
| Chrome  | Latest stable | macOS   | P0       |
| Chrome  | Latest stable | Windows | P0       |
| Chrome  | Latest stable | Linux   | P1       |
| Chrome  | Minimum (114) | macOS   | P1       |
| Edge    | Latest stable | Windows | P1       |
| Brave   | Latest stable | macOS   | P2       |

## 9.4 Content Script Testing Across Sites

### 9.4.1 DOM Operation Compatibility

| Target Site Category     | Test Focus                                    | Priority |
| ------------------------ | --------------------------------------------- | -------- |
| Static HTML pages        | Basic DOM operations                          | P0       |
| React applications       | Input value setting, event dispatch           | P0       |
| Vue applications         | Input value setting, event dispatch           | P1       |
| Angular applications     | Input value setting, event dispatch           | P1       |
| Shadow DOM heavy sites   | Element access across shadow boundaries       | P1       |
| Iframe-based sites       | Content script limitations in iframes         | P1       |
| CSP-restricted sites     | Content script functionality under strict CSP | P1       |
| Single-page applications | DOM mutation detection, selector stability    | P0       |

### 9.4.2 Job Autofill Compatibility Matrix

| Platform            | URL Pattern             | Test Page Source  | Priority |
| ------------------- | ----------------------- | ----------------- | -------- |
| LinkedIn Easy Apply | `linkedin.com/jobs/`    | Mock HTML fixture | P0       |
| Lever               | `jobs.lever.co/`        | Mock HTML fixture | P0       |
| Greenhouse          | `boards.greenhouse.io/` | Mock HTML fixture | P1       |
| Workday             | `*.myworkdayjobs.com/`  | Mock HTML fixture | P2       |
| Generic form        | Any URL with `<form>`   | Mock HTML fixture | P1       |

## 9.5 Extension-Specific Testing

### 9.5.1 Chrome DevTools Testing

| Test Area                | DevTools Panel                | Check                                          |
| ------------------------ | ----------------------------- | ---------------------------------------------- |
| Service worker lifecycle | Application > Service Workers | Worker starts, stays alive, restarts correctly |
| Storage contents         | Application > Storage         | Keys, values, migration logic                  |
| Console errors           | Console                       | No uncaught errors during normal operation     |
| Network requests         | Network                       | API calls succeed, correct headers             |
| Content script injection | Sources                       | Script loaded in correct pages                 |
| Message passing          | Console (verbose logging)     | Messages routed correctly between contexts     |

### 9.5.2 Manual Testing Checklist

| Test              | Steps                                           | Expected Result                    |
| ----------------- | ----------------------------------------------- | ---------------------------------- |
| Install extension | Load unpacked from dist/                        | Extension appears in toolbar       |
| Open popup        | Click toolbar icon                              | Popup displays with status         |
| Open side panel   | Click FAB or use API                            | Side panel opens in sidebar        |
| Send chat message | Type in side panel → Enter                      | Message sent, response streamed    |
| Capture page      | Click "Capture Page" in popup                   | Screenshot captured successfully   |
| Context menu      | Select text → right-click → "Ask AGI Workforce" | Text sent to desktop app           |
| Keyboard shortcut | Cmd+Shift+A                                     | Popup opens                        |
| Capture shortcut  | Cmd+Shift+C                                     | Page captured                      |
| Auto-reconnect    | Kill desktop app → restart                      | Extension reconnects within 30s    |
| API key save      | Enter key in side panel → Save                  | Key stored, status shows Connected |

---

# Section 10: Performance Requirements

## 10.1 Extension Load Time

| Metric                         | Target                    | Measurement                                                             |
| ------------------------------ | ------------------------- | ----------------------------------------------------------------------- |
| Service worker activation      | < 100ms                   | Time from browser startup to `onInstalled`/`onStartup` handler complete |
| Content script injection       | < 50ms impact on page TTI | Measured as delta between TTI with and without extension                |
| Popup open to interactive      | < 200ms                   | Time from toolbar click to popup fully rendered                         |
| Side panel open to interactive | < 300ms                   | Time from open request to side panel fully rendered                     |

## 10.2 Memory Usage

| Component                 | Target | Maximum                       |
| ------------------------- | ------ | ----------------------------- |
| Service worker baseline   | < 5MB  | 10MB                          |
| Content script per tab    | < 3MB  | 5MB                           |
| Side panel                | < 10MB | 20MB (including chat history) |
| Popup                     | < 3MB  | 5MB                           |
| Total extension footprint | < 20MB | 40MB                          |

## 10.3 Bundle Size

| Output File                | Target Size | Current Size |
| -------------------------- | ----------- | ------------ |
| `background.js` (minified) | < 50KB      | ~47KB        |
| `content.js` (minified)    | < 60KB      | ~57KB        |
| `popup.js` (minified)      | < 10KB      | ~9KB         |
| `side_panel.js` (minified) | < 50KB      | ~42KB        |
| Total extension ZIP        | < 200KB     | ~95KB        |

## 10.4 Message Latency

| Operation                             | Target (P50) | Target (P95) | Maximum |
| ------------------------------------- | ------------ | ------------ | ------- |
| Popup → Background                    | < 5ms        | < 10ms       | 50ms    |
| Content script → Background           | < 5ms        | < 10ms       | 50ms    |
| Background → Native host (round-trip) | < 50ms       | < 100ms      | 500ms   |
| Chat message → first token            | < 500ms      | < 2000ms     | 5000ms  |
| Page context capture                  | < 100ms      | < 300ms      | 1000ms  |
| Screenshot capture                    | < 200ms      | < 500ms      | 2000ms  |
| DOM click operation                   | < 10ms       | < 50ms       | 200ms   |
| Form fill (all fields)                | < 100ms      | < 500ms      | 2000ms  |

## 10.5 Rate Limiting Performance

| Metric                      | Value                |
| --------------------------- | -------------------- |
| Rate limiter check overhead | < 0.1ms per check    |
| Message queue processing    | < 1ms per message    |
| Queue capacity              | 1,000 messages max   |
| Queue overflow behavior     | Drop oldest messages |

## 10.6 Page Impact

| Metric                          | Target                                  |
| ------------------------------- | --------------------------------------- |
| Page load time increase (TTI)   | < 50ms                                  |
| Page memory increase            | < 5MB                                   |
| DOM mutation observer overhead  | < 1ms per mutation                      |
| Scroll event handler overhead   | < 1ms per frame                         |
| Layout shift from FAB injection | 0 (fixed positioning, no layout impact) |

---

# Section 11: Security

## 11.1 Threat Model

### 11.1.1 Attack Surface

| Surface                | Threat                                          | Mitigation                                                               |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| Content script in page | Malicious page attempts to exploit extension    | Closed shadow DOM, allowlisted DOM operations, no eval                   |
| Native messaging       | Man-in-the-middle between extension and desktop | Chrome validates extension ID in allowed_origins                         |
| API key storage        | Key exfiltration from storage                   | `chrome.storage.session` (memory-only, cleared on close)                 |
| Injected HTML in chat  | XSS via assistant response                      | DOMParser-based sanitizer strips scripts, event handlers                 |
| Form autofill          | Unintended data disclosure                      | User must explicitly trigger autofill; auto-submit requires confirmation |
| Context menu           | Sensitive text sent to AI                       | User must explicitly select "Ask AGI Workforce"                          |
| Page context sync      | Sensitive page content synced                   | Deduplication prevents excessive syncs; user controls context capture    |

### 11.1.2 Trust Boundaries

```
┌─────────────────────────────────────────────────┐
│  User's Browser (Trust Boundary 1)               │
│                                                   │
│  ┌──────────────────────────────────────────────┐│
│  │  Extension Isolated World (Trust Boundary 2) ││
│  │                                              ││
│  │  Service Worker (most privileged)            ││
│  │  ├── Native messaging port                   ││
│  │  ├── Chrome APIs (tabs, storage, cookies)    ││
│  │  └── Cross-origin fetch                      ││
│  │                                              ││
│  │  Content Script (page context)               ││
│  │  ├── DOM read/write access                   ││
│  │  ├── Message passing only to service worker  ││
│  │  └── Cannot access chrome.* APIs directly    ││
│  │                                              ││
│  │  Popup / Side Panel (extension context)      ││
│  │  ├── Extension page CSP                      ││
│  │  └── Message passing to service worker       ││
│  └──────────────────────────────────────────────┘│
│                                                   │
│  ┌──────────────────────────────────────────────┐│
│  │  Page World (untrusted)                      ││
│  │  ├── Cannot access extension isolated world  ││
│  │  ├── Cannot access closed shadow DOM         ││
│  │  └── Cannot send messages to extension       ││
│  └──────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
        │
        │ Native Messaging (stdin/stdout)
        │ (Trust Boundary 3)
        ▼
┌─────────────────────────────────────────────────┐
│  Desktop App (Trust Boundary 4)                  │
│  ├── Extension ID validated in allowed_origins   │
│  ├── ToolGuard sandbox                           │
│  └── SecretManager encryption                    │
└─────────────────────────────────────────────────┘
```

## 11.2 Secret Storage

### 11.2.1 API Key Storage

| Property         | Value                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------- |
| Primary storage  | `chrome.storage.session`                                                                |
| Fallback storage | `chrome.storage.local` (migration only)                                                 |
| Lifetime         | Cleared when browser closes                                                             |
| Encryption       | Not encrypted by extension (Chrome encrypts storage on disk)                            |
| Migration        | Legacy keys in local storage migrated to session on first load, then deleted from local |

### 11.2.2 Storage Security Properties

| Storage Area             | Encrypted at Rest | Cleared on Close | Accessible By       |
| ------------------------ | ----------------- | ---------------- | ------------------- |
| `chrome.storage.session` | Yes (OS-level)    | Yes              | This extension only |
| `chrome.storage.local`   | Yes (OS-level)    | No               | This extension only |
| IndexedDB                | Yes (OS-level)    | No               | This extension only |

### 11.2.3 Key Handling Rules

1. API keys are NEVER logged to console (even in debug mode)
2. API keys are NEVER included in error messages
3. API keys are NEVER stored in `chrome.storage.local` (except during migration cleanup)
4. API keys are NEVER sent to any server other than the intended LLM API endpoint
5. API keys are NEVER included in page context syncs

## 11.3 Content Script Security

### 11.3.1 No Dynamic Code Evaluation

The following are categorically prohibited in ALL extension scripts:

| Prohibited                  | Alternative                    |
| --------------------------- | ------------------------------ |
| `eval()`                    | Pre-defined function lookup    |
| `new Function()`            | Static function references     |
| `setTimeout(string, ...)`   | `setTimeout(function, ...)`    |
| `setInterval(string, ...)`  | `setInterval(function, ...)`   |
| `document.write()`          | DOM API manipulation           |
| Inline `<script>` injection | Manifest-declared scripts only |

### 11.3.2 EXECUTE_SCRIPT Allowlist

The `EXECUTE_SCRIPT` message type only permits operations from this strict allowlist:

| Operation           | Description                      |
| ------------------- | -------------------------------- |
| `scrollTo`          | Scroll to absolute coordinates   |
| `scrollBy`          | Scroll by relative delta         |
| `scrollIntoView`    | Scroll element into viewport     |
| `getScrollPosition` | Return current scroll x/y        |
| `getViewportSize`   | Return viewport width/height     |
| `getComputedStyle`  | Return CSS property for selector |
| `getBoundingRect`   | Return DOMRect for selector      |
| `focusElement`      | Call .focus() on selector        |
| `blurElement`       | Call .blur() on selector         |

Any operation name not in this list is rejected with an error naming the rejected operation.

### 11.3.3 SET_ATTRIBUTE Allowlist

The following attribute patterns are BLOCKED regardless of target element:

| Blocked Pattern                       | Reason                  |
| ------------------------------------- | ----------------------- |
| `on*` (onclick, onerror, onload, ...) | Event handler injection |
| `href` on `<script>`                  | Script source injection |
| `src` on `<script>`                   | Script source injection |
| `action` on `<form>`                  | Form action hijacking   |
| `formaction` on any element           | Form action hijacking   |
| `srcdoc` on `<iframe>`                | Frame content injection |

### 11.3.4 Closed Shadow DOM

All injected UI elements (FAB, automation indicator) use `attachShadow({ mode: 'closed' })`:

```typescript
const shadow = host.attachShadow({ mode: 'closed' });
// Page JavaScript cannot access:
//   host.shadowRoot  → returns null
//   shadow.querySelector(...)  → not accessible from page
```

### 11.3.5 HTML Sanitization

The side panel sanitizes all HTML before rendering assistant messages:

**Stripped elements:** `script`, `iframe`, `object`, `embed`, `form`, `link`, `meta`, `base`, `applet`, `math`, `svg`, `style`

**Stripped attributes:** `on*` (event handlers), `srcdoc`, `formaction`, `xlink:href`, `data`

**URL sanitization:** `href`, `src`, `action` attributes must match `^(https?:|mailto:|#|/(?!/))` — `javascript:` and `data:` URLs are stripped.

**Style sanitization:** `style` attributes containing `expression()` or `url()` are removed.

## 11.4 Origin Validation

### 11.4.1 Native Messaging Origin

The native messaging host manifest includes an `allowed_origins` list. Chrome validates that only the extension with the declared ID can connect to the host:

```json
{
  "allowed_origins": ["chrome-extension://EXTENSION_ID/"]
}
```

### 11.4.2 Extension Message Validation

All `chrome.runtime.onMessage` handlers validate the sender:

```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // sender.id must match our extension ID
  // sender.tab provides tab context for content script messages
  // External messages are blocked by default
});
```

## 11.5 Rate Limiting

### 11.5.1 Per-Tab Rate Limiting

```typescript
class RateLimiter {
  maxRequestsPerMinute: 120; // 120 requests per minute per tab
  screenshotCooldownMs: 500; // 500ms between screenshots

  isLimited(tabId: number, messageType: string): boolean;
  reset(tabId: number): void;
  clear(): void;
}
```

### 11.5.2 Rate Limit Enforcement Points

| Point                       | Limit             | Behavior on Exceed       |
| --------------------------- | ----------------- | ------------------------ |
| Background → Content Script | 120/min per tab   | Queued (not dropped)     |
| Background → Native Host    | 120/min per tab   | Queued                   |
| Screenshot capture          | 500ms cooldown    | Rejected immediately     |
| Side panel → Background     | No explicit limit | Relies on streaming lock |
| Message queue               | 1,000 max         | Oldest dropped           |

## 11.6 Data Protection

### 11.6.1 Data at Rest

| Data             | Storage                  | Protection                    |
| ---------------- | ------------------------ | ----------------------------- |
| Chat messages    | `chrome.storage.local`   | Chrome OS-level encryption    |
| API key          | `chrome.storage.session` | Memory-only, cleared on close |
| Autofill profile | `chrome.storage.local`   | Chrome OS-level encryption    |
| Extension config | `chrome.storage.local`   | Chrome OS-level encryption    |

### 11.6.2 Data in Transit

| Channel                                | Protection                               |
| -------------------------------------- | ---------------------------------------- |
| Extension → Desktop (native messaging) | Local process communication (no network) |
| Extension → LLM API (standalone mode)  | HTTPS/TLS                                |
| Extension → Chrome Storage             | In-process (no network)                  |

## 11.7 Platform-Specific CVE Mitigations

| CVE Category              | Mitigation                                                                      |
| ------------------------- | ------------------------------------------------------------------------------- |
| XSS via content injection | DOMParser sanitizer, no eval, no inline scripts                                 |
| Clickjacking              | Extension pages use CSP `frame-ancestors 'none'` (implicit)                     |
| Open redirect             | URL validation via `validators.isSafeUrl()`                                     |
| Prototype pollution       | Frozen objects for sensitive config; no `Object.assign` from untrusted input    |
| ReDoS                     | All regex patterns tested for catastrophic backtracking                         |
| Information disclosure    | API keys never logged; error messages sanitized                                 |
| Privilege escalation      | Content scripts cannot access chrome.\* APIs; message-passing boundary enforced |

---

# Section 12: Accessibility

## 12.1 Popup Accessibility

### 12.1.1 Keyboard Navigation

| Element             | Tab Order | Key         | Action                     |
| ------------------- | --------- | ----------- | -------------------------- |
| Capture Page button | 1         | Enter/Space | Trigger capture            |
| Refresh button      | 2         | Enter/Space | Refresh status             |
| Footer link         | 3         | Enter       | Open AGI Workforce website |
| Cmd+R               | Global    | Cmd/Ctrl+R  | Refresh all data           |

### 12.1.2 Screen Reader Support

| Element        | ARIA Role | ARIA Label                        | Live Region                                              |
| -------------- | --------- | --------------------------------- | -------------------------------------------------------- |
| Status card    | `status`  | "Connection status"               | `aria-live="polite"` (recommended)                       |
| Status title   | —         | —                                 | Text content announces state change                      |
| Capture button | `button`  | "Capture current page screenshot" | —                                                        |
| Refresh button | `button`  | "Refresh extension status"        | —                                                        |
| Tab count      | —         | —                                 | `aria-label="Number of open tabs"` (recommended)         |
| Action count   | —         | —                                 | `aria-label="Number of actions performed"` (recommended) |

### 12.1.3 Color Contrast

| Element                     | Foreground | Background | Contrast Ratio | WCAG AA |
| --------------------------- | ---------- | ---------- | -------------- | ------- |
| Header text                 | `#ffffff`  | `#667eea`  | 4.5:1+         | Pass    |
| Status title (connected)    | `#155724`  | `#d4edda`  | 4.5:1+         | Pass    |
| Status title (disconnected) | `#495057`  | `#f8f9fa`  | 4.5:1+         | Pass    |
| Action button text          | `#495057`  | `#f8f9fa`  | 4.5:1+         | Pass    |
| Primary button text         | `#ffffff`  | `#667eea`  | 4.5:1+         | Pass    |
| Info value text             | `#6c757d`  | `#f8f9fa`  | 4.5:1+         | Pass    |
| Stat value text             | `#667eea`  | `#f8f9fa`  | 4.5:1+         | Pass    |

## 12.2 Side Panel Accessibility

### 12.2.1 Keyboard Navigation

| Element          | Tab Order              | Key         | Action              |
| ---------------- | ---------------------- | ----------- | ------------------- |
| Settings button  | 1                      | Enter/Space | Toggle settings bar |
| Clear button     | 2                      | Enter/Space | Clear conversation  |
| Bridge URL input | 3 (when settings open) | Enter       | Save bridge URL     |
| Apply button     | 4 (when settings open) | Enter/Space | Save bridge URL     |
| API key input    | 5                      | Enter       | Save API key        |
| Save button      | 6                      | Enter/Space | Save API key        |
| Messages area    | 7                      | Arrow keys  | Scroll messages     |
| Context button   | 8                      | Enter/Space | Toggle page context |
| Mic button       | 9                      | Enter/Space | Toggle voice input  |
| Chat textarea    | 10                     | Enter       | Send message        |
| Send button      | 11                     | Enter/Space | Send message        |

### 12.2.2 Screen Reader Support

| Element            | Role     | Announcement                       |
| ------------------ | -------- | ---------------------------------- |
| Header             | `banner` | "AGI Workforce AI Assistant"       |
| Messages area      | `log`    | Live region for new messages       |
| User message       | —        | "You said: [message text]"         |
| Assistant message  | —        | "Assistant: [message text]"        |
| Error message      | `alert`  | "Error: [error text]"              |
| Thinking indicator | `status` | "Processing..."                    |
| Send button        | `button` | "Send message"                     |
| Context button     | `button` | "Add page context to next message" |
| Mic button         | `button` | "Voice input"                      |
| Status pill        | `status` | "Connected" / "Not Connected"      |

### 12.2.3 Recommendations for Enhancement

| ID      | Enhancement                                                     | Priority |
| ------- | --------------------------------------------------------------- | -------- |
| A11Y-01 | Add `role="log"` and `aria-live="polite"` to messages container | P1       |
| A11Y-02 | Add `role="alert"` to error messages                            | P1       |
| A11Y-03 | Add `aria-label` to all icon buttons (settings, clear, mic)     | P0       |
| A11Y-04 | Add `aria-busy="true"` to messages area during streaming        | P1       |
| A11Y-05 | Add skip link to jump from header to input                      | P2       |
| A11Y-06 | Add keyboard shortcut hint in textarea placeholder              | P2       |
| A11Y-07 | Announce new messages to screen readers via live region         | P1       |
| A11Y-08 | Support Escape key to close settings panel                      | P1       |
| A11Y-09 | Trap focus within settings panel when open                      | P2       |
| A11Y-10 | High contrast mode support                                      | P2       |

## 12.3 Content Script Overlay Accessibility

### 12.3.1 FAB Accessibility

| Property            | Value                                                             |
| ------------------- | ----------------------------------------------------------------- |
| Role                | `button`                                                          |
| Label               | `aria-label="Open AGI Workforce sidebar"`                         |
| Keyboard accessible | Must be focusable and activatable via Enter/Space                 |
| Focus visible       | Must have visible focus indicator                                 |
| Motion              | Connection status dot animation respects `prefers-reduced-motion` |

### 12.3.2 Automation Indicator Accessibility

| Property     | Value                             |
| ------------ | --------------------------------- |
| Role         | `alert`                           |
| Label        | "Page under automation control"   |
| Dismissible  | No (shown only during automation) |
| Non-blocking | Must not block page interaction   |

## 12.4 WCAG AA Compliance Targets

| Criterion                | Target                                              | Status                                      |
| ------------------------ | --------------------------------------------------- | ------------------------------------------- |
| 1.1.1 Non-text Content   | All icon buttons have text alternatives             | Partial (needs aria-labels)                 |
| 1.4.3 Contrast (Minimum) | 4.5:1 for text, 3:1 for large text                  | Pass (dark theme)                           |
| 1.4.11 Non-text Contrast | 3:1 for UI components                               | Pass                                        |
| 2.1.1 Keyboard           | All functionality available via keyboard            | Partial (some icon buttons need tab access) |
| 2.4.3 Focus Order        | Logical focus sequence                              | Pass                                        |
| 2.4.7 Focus Visible      | Visible focus indicator on all interactive elements | Partial (needs custom focus styles)         |
| 3.2.1 On Focus           | No change of context on focus                       | Pass                                        |
| 4.1.2 Name, Role, Value  | All UI components have accessible names             | Partial (needs ARIA enhancements)           |

---

# Section 13: Competitive Analysis

## 13.1 Market Landscape

The AI browser extension market is rapidly growing, with most major AI companies offering browser companions. However, most extensions are simple chat sidebars that read page content — none offer the deep DOM automation, native desktop bridge, and job autofill capabilities of AGI Workforce.

## 13.2 Feature-by-Feature Comparison

### 13.2.1 Claude Browser Extension

| Feature                  | Claude Extension               | AGI Workforce Extension                                     |
| ------------------------ | ------------------------------ | ----------------------------------------------------------- |
| **Chat interface**       | Popup with text input          | Full side panel with streaming, markdown, code highlighting |
| **Page reading**         | Text extraction (visible text) | Full DOM access (HTML, text, attributes, forms)             |
| **Model support**        | Anthropic only                 | 12+ providers via desktop bridge                             |
| **DOM automation**       | None                           | Full (click, type, scroll, hover, drag-drop, etc.)          |
| **Form autofill**        | None                           | AI-driven, platform-aware (LinkedIn, Lever)                 |
| **Job autofill**         | None                           | Dedicated system with profile storage                       |
| **Screenshot capture**   | None                           | Full tab + element capture                                  |
| **Desktop integration**  | None                           | Native messaging bridge to Tauri app                        |
| **Tab management**       | None                           | Create, close, switch, list tabs                            |
| **Cookie management**    | None                           | Read, set, clear cookies                                    |
| **Context menus**        | "Ask Claude" on selection      | 3 items: Capture Element, Get Info, Ask AGI                 |
| **Action recording**     | None                           | Record and replay user interactions                         |
| **Accessibility tree**   | None                           | Full tree extraction                                        |
| **Voice input**          | None                           | Web Speech API                                              |
| **Conversation history** | Cloud-synced                   | Local (50 messages, chrome.storage.local)                   |
| **API key storage**      | Cloud account                  | chrome.storage.session (memory only)                        |
| **Offline mode**         | None                           | Via local LLMs through desktop bridge                       |
| **Pricing**              | Requires Claude subscription   | Free with BYOK or AGI Workforce subscription                |

**Claude Extension Strengths:**

- Seamless integration with claude.ai account
- Clean, simple UI
- Cloud conversation sync

**AGI Workforce Advantages:**

- Deep DOM automation (click, type, scroll, forms)
- Job application autofill
- Model agnostic (not locked to one provider)
- Desktop bridge for full agent capabilities
- Side panel for persistent chat alongside pages

### 13.2.2 ChatGPT Browser Extension (Unofficial)

There is no official ChatGPT browser extension. Third-party extensions exist but have varying quality:

| Feature             | Typical ChatGPT Extension | AGI Workforce Extension     |
| ------------------- | ------------------------- | --------------------------- |
| Chat interface      | Popup                     | Full side panel             |
| Page reading        | Text extraction           | Full DOM access             |
| Model support       | OpenAI only               | 12+ providers                |
| DOM automation      | None                      | Full                        |
| Form autofill       | None                      | Platform-aware              |
| Desktop integration | None                      | Native messaging            |
| Security            | Varies widely             | CSP, shadow DOM, allowlists |

### 13.2.3 Monica AI

| Feature             | Monica AI                | AGI Workforce Extension          |
| ------------------- | ------------------------ | -------------------------------- |
| Chat interface      | Side panel + popup       | Side panel + popup               |
| Page reading        | Text + image             | Full DOM access                  |
| Model support       | Multiple (GPT-4, Claude) | 12+ providers + local LLMs        |
| DOM automation      | Limited                  | Full                             |
| Form autofill       | Basic                    | Platform-aware (LinkedIn, Lever) |
| Desktop integration | None                     | Native messaging bridge          |
| Tab management      | None                     | Full                             |
| Action recording    | None                     | Yes                              |
| Pricing             | Subscription required    | BYOK + subscription options      |

### 13.2.4 Grammarly

While primarily a writing assistant, Grammarly is relevant as a successful browser extension that interacts with page content:

| Feature          | Grammarly                    | AGI Workforce Extension       |
| ---------------- | ---------------------------- | ----------------------------- |
| Text analysis    | Grammar/style checking       | AI-powered page understanding |
| Form interaction | Inline suggestions in inputs | Full form autofill            |
| DOM manipulation | Overlay suggestions          | Full DOM automation           |
| Use case         | Writing assistance           | General AI agent              |
| Offline mode     | Limited                      | Via local LLMs                |

### 13.2.5 Kagi Assistant / Perplexity Extension

| Feature             | Kagi / Perplexity         | AGI Workforce Extension |
| ------------------- | ------------------------- | ----------------------- |
| Chat interface      | Side panel                | Side panel              |
| Page reading        | Text + search integration | Full DOM access         |
| DOM automation      | None                      | Full                    |
| Search integration  | Deep web search           | Via desktop agent       |
| Model support       | Own models                | 12+ providers            |
| Desktop integration | None                      | Native messaging bridge |

## 13.3 Competitive Positioning Matrix

```
                    Page Reading Only ◄────────────► Full DOM Automation
                         │                                   │
 Single Model    ────────┤  Claude Extension                │
                         │  ChatGPT Extensions              │
                         │                                   │
                         │  Monica AI (partial DOM)          │
                         │                                   │
 Multi-Model     ────────┤                    AGI Workforce ◄── Only here
                         │                                   │
                         │                                   │
 Local + Cloud   ────────┤                    AGI Workforce ◄── Only here
                         │                                   │
```

## 13.4 Where AGI Workforce Leads

| Advantage                | Description                                                      | Competitors                               |
| ------------------------ | ---------------------------------------------------------------- | ----------------------------------------- |
| Desktop bridge           | Native messaging to Tauri desktop app with full agent runtime    | No competitor has this                    |
| Full DOM automation      | 30+ DOM operation types (click, type, scroll, hover, drag, etc.) | No competitor matches depth               |
| Job application autofill | Platform-specific autofill for LinkedIn, Lever, Greenhouse       | No competitor offers this                 |
| Model agnostic           | 12+ cloud providers + local LLMs via desktop bridge               | Claude (Anthropic only), Monica (limited) |
| Action recording         | Record and replay user interactions                              | No competitor has this                    |
| Accessibility tree       | Full page accessibility tree extraction                          | No competitor has this                    |
| Security model           | Closed shadow DOM + allowlists + session-only API storage        | Most competitors use cloud storage        |
| Local LLM support        | Via desktop bridge to Ollama, LM Studio, etc.                    | No competitor supports this               |

## 13.5 Where Parity is Needed

| Gap                               | Description                                      | Priority | Plan                                      |
| --------------------------------- | ------------------------------------------------ | -------- | ----------------------------------------- |
| Cloud conversation sync           | Claude syncs conversations across devices        | P2       | Implement via desktop app's Supabase sync |
| Image understanding in side panel | Claude can analyze images on pages               | P1       | Wire vision models through desktop bridge |
| Inline text suggestions           | Grammarly-style inline suggestions in inputs     | P3       | Content script overlay enhancement        |
| One-click setup                   | Claude has zero-config with cloud account        | P1       | Simplify API key setup flow               |
| Multi-language                    | Competitors support many languages               | P2       | Leverage multi-lingual LLMs               |
| Dedicated options page            | Proper settings page rather than inline settings | P2       | Build `options.html` page                 |

## 13.6 Strategic Gaps to Own

### 13.6.1 AI-Driven Browser Automation (AGI Workforce Exclusive)

No competing extension offers an AI agent that can autonomously control the browser — clicking elements, filling forms, navigating between pages, and executing multi-step workflows. This is the extension's killer feature and must be relentlessly polished.

### 13.6.2 Job Application Automation (AGI Workforce Exclusive)

No competing extension offers platform-specific job application autofill. Expanding platform support (Greenhouse, Workday, Indeed, iCIMS) and improving detection accuracy will deepen this moat.

### 13.6.3 Desktop-Browser Unified Agent (AGI Workforce Exclusive)

The native messaging bridge creates a unique capability: an AI agent that can operate both on the desktop (files, terminal, applications) and in the browser (web pages, forms, tabs) within a single workflow. This cross-surface capability does not exist in any competitor.

### 13.6.4 Unrestricted Model Choice (AGI Workforce Lead)

No competing browser extension offers true model agnosticism. Claude's extension is Anthropic-only. ChatGPT extensions are OpenAI-only. AGI Workforce connects to 12+ cloud providers plus local LLMs, giving users the freedom to choose the best model for each task.

### 13.6.5 Privacy-First Local Operation (AGI Workforce Lead)

When connected to the desktop app running local LLMs (Ollama, LM Studio), the entire AI pipeline is local — no data leaves the user's machine. This is a significant differentiator for privacy-conscious users and enterprises.

---

# Appendix A: Manifest V3 Reference

## A.1 Full Manifest

```json
{
  "manifest_version": 3,
  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs4L2zq...",
  "name": "AGI Workforce Browser Automation",
  "version": "1.1.0",
  "description": "Intelligent browser automation and integration for AGI Workforce desktop application",
  "author": "AGI Workforce",
  "homepage_url": "https://agiworkforce.com",
  "permissions": [
    "activeTab",
    "tabs",
    "storage",
    "nativeMessaging",
    "alarms",
    "contextMenus",
    "sidePanel",
    "scripting",
    "cookies"
  ],
  "optional_permissions": ["downloads", "bookmarks", "history"],
  "host_permissions": ["<all_urls>"],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'"
  },
  "background": {
    "service_worker": "src/background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content.js"],
      "run_at": "document_idle",
      "all_frames": false,
      "match_about_blank": false
    }
  ],
  "action": {
    "default_popup": "src/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    "default_title": "AGI Workforce"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "commands": {
    "_execute_action": {
      "suggested_key": {
        "default": "Ctrl+Shift+A",
        "mac": "Command+Shift+A"
      },
      "description": "Open AGI Workforce popup"
    },
    "capture_page": {
      "suggested_key": {
        "default": "Ctrl+Shift+C",
        "mac": "Command+Shift+C"
      },
      "description": "Capture current page"
    }
  },
  "side_panel": {
    "default_path": "src/side_panel.html"
  },
  "minimum_chrome_version": "114",
  "offline_enabled": false
}
```

---

# Appendix B: Native Message Type Reference

## B.1 Desktop → Extension Messages

| Type          | Rust Enum Variant      | Fields                                                           |
| ------------- | ---------------------- | ---------------------------------------------------------------- |
| Connection    | `Connect`              | `extension_id: String`                                           |
| Connection    | `Disconnect`           | `reason: Option<String>`                                         |
| Heartbeat     | `Ping`                 | —                                                                |
| Heartbeat     | `Pong`                 | —                                                                |
| Automation    | `Click`                | `selector: String, tab_id: Option<i32>`                          |
| Automation    | `Type`                 | `selector: String, text: String, tab_id: Option<i32>`            |
| Automation    | `Navigate`             | `url: String, tab_id: Option<i32>`                               |
| Automation    | `Screenshot`           | `tab_id: Option<i32>, format: Option<String>`                    |
| Automation    | `Hover`                | `selector: String, tab_id: Option<i32>`                          |
| Automation    | `WaitForSelector`      | `selector: String, timeout_ms: Option<u64>, tab_id: Option<i32>` |
| Automation    | `SelectOption`         | `selector: String, value: String, tab_id: Option<i32>`           |
| Automation    | `SetChecked`           | `selector: String, checked: bool, tab_id: Option<i32>`           |
| Automation    | `Focus`                | `selector: String, tab_id: Option<i32>`                          |
| Automation    | `ScrollIntoView`       | `selector: String, tab_id: Option<i32>`                          |
| DOM           | `GetElement`           | `selector: String, tab_id: Option<i32>`                          |
| DOM           | `GetElements`          | `selector: String, tab_id: Option<i32>`                          |
| DOM           | `GetText`              | `selector: String, tab_id: Option<i32>`                          |
| DOM           | `GetAttribute`         | `selector: String, attribute: String, tab_id: Option<i32>`       |
| DOM           | `SetAttribute`         | `selector, attribute, value: String, tab_id: Option<i32>`        |
| Accessibility | `GetAccessibilityTree` | `tab_id: Option<i32>`                                            |
| Accessibility | `GetFocusableElements` | `tab_id: Option<i32>`                                            |
| Tabs          | `GetTabs`              | —                                                                |
| Tabs          | `GetActiveTab`         | —                                                                |
| Tabs          | `CreateTab`            | `url: String`                                                    |
| Tabs          | `CloseTab`             | `tab_id: i32`                                                    |
| Tabs          | `SwitchTab`            | `tab_id: i32`                                                    |
| Cookies       | `GetCookies`           | `url: Option<String>`                                            |
| Cookies       | `SetCookie`            | `cookie: CookieData`                                             |
| Storage       | `GetLocalStorage`      | `key: Option<String>, tab_id: Option<i32>`                       |
| Storage       | `SetLocalStorage`      | `key: String, value: String, tab_id: Option<i32>`                |
| Page          | `GetPageInfo`          | `tab_id: Option<i32>`                                            |
| Page          | `GetPageContent`       | `tab_id: Option<i32>`                                            |
| Scripting     | `ExecuteScript`        | `script: String, tab_id: Option<i32>`                            |
| Response      | `Response`             | `id, success, data?, error?`                                     |

## B.2 Extension → Desktop Messages

| Type    | Rust Enum Variant   | Fields                                                                        |
| ------- | ------------------- | ----------------------------------------------------------------------------- |
| Context | `PageContext`       | `url, title, html, selected_text?, tab_id, timestamp`                         |
| Task    | `TaskResult`        | `task_id, success, screenshot?, result?, error?, actions_performed, duration` |
| Query   | `SelectedTextQuery` | `selected_text, context_url?, tab_id?`                                        |

---

# Appendix C: Job Application Profile Schema

## C.1 Full Profile Interface

```typescript
interface JobApplicationProfile {
  // Personal
  firstName?: string;
  lastName?: string;
  fullName?: string;

  // Contact
  email?: string;
  phone?: string;

  // Location
  locationCity?: string;
  locationState?: string;
  locationCountry?: string;

  // Professional URLs
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  websiteUrl?: string;

  // Work
  currentCompany?: string;
  currentTitle?: string;
  yearsOfExperience?: string;
  workAuthorization?: string;
  requiresSponsorship?: boolean | string;
  salaryExpectation?: string;

  // Documents
  resumeText?: string;
  coverLetterText?: string;

  // Custom answers (key: question ID, value: answer)
  customAnswers?: Record<string, string>;

  // File uploads
  files?: {
    resumeDataUrl?: string;
    resumeFileName?: string;
    coverLetterDataUrl?: string;
    coverLetterFileName?: string;
  };
}
```

## C.2 Autofill Options

```typescript
interface JobAutofillOptions {
  platform?: 'auto' | 'greenhouse' | 'workday' | 'generic';
  autoSubmit?: boolean; // Default: false
  allowSubmitWithMissingRequired?: boolean; // Default: false
  includeOptionalFields?: boolean; // Default: true
  delayMs?: number; // Default: 100ms between fields
  maxSubmitSteps?: number; // Default: 3
}
```

## C.3 Autofill Result

```typescript
interface AutoFillJobApplicationResponse {
  success: boolean;
  platform?: 'greenhouse' | 'workday' | 'generic' | 'unknown';
  filledCount?: number;
  skippedCount?: number;
  genericFlowStarted?: boolean;
  missingRequiredFields?: string[];
  submitted?: boolean;
  stepsAdvanced?: number;
  details?: {
    filledFields: string[];
    skippedFields: string[];
    errors: string[];
  };
  error?: string;
}
```

---

# Appendix D: Design Tokens

## D.1 Side Panel Color Palette

| Token                    | Value     | Usage                        |
| ------------------------ | --------- | ---------------------------- |
| `--sp-bg`                | `#0f0f14` | Main background              |
| `--sp-header-bg`         | `#13131a` | Header background            |
| `--sp-border`            | `#1e1e2e` | Border color                 |
| `--sp-text`              | `#e2e8f0` | Primary text                 |
| `--sp-text-dim`          | `#64748b` | Secondary text               |
| `--sp-text-muted`        | `#334155` | Muted text, timestamps       |
| `--sp-text-bright`       | `#f1f5f9` | Bright text (headings)       |
| `--sp-brand`             | `#6366f1` | Brand indigo                 |
| `--sp-brand-dark`        | `#4338ca` | Brand indigo (dark)          |
| `--sp-brand-darker`      | `#3730a3` | Brand indigo (darker, hover) |
| `--sp-brand-purple`      | `#8b5cf6` | Brand purple (gradient)      |
| `--sp-brand-violet`      | `#7c3aed` | Model badge text             |
| `--sp-user-bubble`       | `#3730a3` | User message background      |
| `--sp-user-text`         | `#e0e7ff` | User message text            |
| `--sp-assistant-bubble`  | `#1a1a2e` | Assistant message background |
| `--sp-assistant-border`  | `#1e2030` | Assistant message border     |
| `--sp-error-bg`          | `#450a0a` | Error message background     |
| `--sp-error-border`      | `#7f1d1d` | Error message border         |
| `--sp-error-text`        | `#fca5a5` | Error message text           |
| `--sp-success`           | `#86efac` | Success/connected text       |
| `--sp-success-bg`        | `#052e16` | Success background           |
| `--sp-success-border`    | `#166534` | Success border               |
| `--sp-danger`            | `#f87171` | Danger/disconnected text     |
| `--sp-danger-bg`         | `#1c0505` | Danger background            |
| `--sp-danger-border`     | `#7f1d1d` | Danger border                |
| `--sp-code-bg`           | `#0f172a` | Inline code background       |
| `--sp-code-border`       | `#1e293b` | Code border                  |
| `--sp-code-text`         | `#a5f3fc` | Inline code text             |
| `--sp-pre-bg`            | `#0d1117` | Code block background        |
| `--sp-pre-text`          | `#c9d1d9` | Code block text              |
| `--sp-link`              | `#818cf8` | Link color                   |
| `--sp-blockquote-border` | `#4338ca` | Blockquote left border       |
| `--sp-blockquote-text`   | `#94a3b8` | Blockquote text              |

## D.2 Popup Color Palette

| Token                      | Value     | Usage                     |
| -------------------------- | --------- | ------------------------- |
| `--popup-gradient-start`   | `#667eea` | Header gradient start     |
| `--popup-gradient-end`     | `#764ba2` | Header gradient end       |
| `--popup-content-bg`       | `#ffffff` | Content area background   |
| `--popup-text`             | `#333333` | Primary text              |
| `--popup-text-dim`         | `#6c757d` | Secondary text            |
| `--popup-border`           | `#dee2e6` | Border color              |
| `--popup-card-bg`          | `#f8f9fa` | Card background           |
| `--popup-connected-bg`     | `#d4edda` | Connected card background |
| `--popup-connected-dot`    | `#28a745` | Connected indicator       |
| `--popup-disconnected-dot` | `#dc3545` | Disconnected indicator    |
| `--popup-stat-accent`      | `#667eea` | Stat value accent color   |

## D.3 Typography

| Property             | Value                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------- |
| Font family          | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif` |
| Monospace family     | `'SF Mono', 'Cascadia Code', Consolas, monospace`                                     |
| Side panel base size | 13px                                                                                  |
| Popup base size      | 14px                                                                                  |
| Line height          | 1.5 (inputs), 1.55 (bubbles)                                                          |

---

# Appendix E: Error Messages

## E.1 User-Facing Error Messages

| Context              | Error                | Message                                                      |
| -------------------- | -------------------- | ------------------------------------------------------------ |
| Popup status         | Desktop not detected | "Desktop app not detected"                                   |
| Popup status         | Check failed         | "Failed to check status"                                     |
| Popup capture        | No active tab        | "No active tab found"                                        |
| Popup capture        | Screenshot failed    | "Failed" (button label)                                      |
| Side panel streaming | Extension error      | "Error: [browser error message]"                             |
| Side panel streaming | API error            | "Error: [API error message]"                                 |
| Side panel streaming | Timeout              | "Error: Request timed out"                                   |
| Side panel auth      | Invalid key          | No error shown (optimistic connection)                       |
| Content script       | Invalid selector     | Logged to console only                                       |
| Content script       | Element not found    | `{ success: false, error: "Element not found" }`             |
| Native messaging     | Host not found       | "Native host not found" (logged; popup shows "Disconnected") |
| Native messaging     | Access denied        | "Access denied" (logged; popup shows "Disconnected")         |
| Rate limiting        | Request limited      | Queued silently (no user-visible error)                      |

## E.2 Developer-Facing Log Messages

All log messages are prefixed with `[AGI Workforce]`:

| Level | Example                                                              |
| ----- | -------------------------------------------------------------------- |
| DEBUG | `[AGI Workforce] Message queued: CLICK`                              |
| INFO  | `[AGI Workforce] Content script initializing on https://example.com` |
| WARN  | `[AGI Workforce] Attempt 1 failed, retrying in 1000ms`               |
| ERROR | `[AGI Workforce] Failed to initialize popup [Error object]`          |

---

# Appendix F: Keyboard Shortcuts

## F.1 Global Shortcuts

| Shortcut                                         | Action               | Configurable                              |
| ------------------------------------------------ | -------------------- | ----------------------------------------- |
| `Cmd+Shift+A` (Mac) / `Ctrl+Shift+A` (Win/Linux) | Open extension popup | Yes (via `chrome://extensions/shortcuts`) |
| `Cmd+Shift+C` (Mac) / `Ctrl+Shift+C` (Win/Linux) | Capture current page | Yes (via `chrome://extensions/shortcuts`) |

## F.2 Popup Shortcuts

| Shortcut           | Action                                |
| ------------------ | ------------------------------------- |
| `Cmd+R` / `Ctrl+R` | Refresh all popup data                |
| `Tab`              | Navigate between interactive elements |
| `Enter` / `Space`  | Activate focused button               |

## F.3 Side Panel Shortcuts

| Shortcut      | Action                                |
| ------------- | ------------------------------------- |
| `Enter`       | Send message                          |
| `Shift+Enter` | New line in message                   |
| `Tab`         | Navigate between interactive elements |

---

# Appendix G: Glossary

| Term             | Definition                                                                            |
| ---------------- | ------------------------------------------------------------------------------------- |
| FAB              | Floating Action Button — the circular overlay button injected on every page           |
| Native Messaging | Chrome API for bidirectional communication between extensions and local applications  |
| Service Worker   | Background script in Manifest V3 extensions (replaces persistent background pages)    |
| Content Script   | JavaScript that runs in the context of web pages                                      |
| Side Panel       | Browser sidebar (Chrome 114+) for persistent extension UI                             |
| MV3              | Manifest V3 — the current Chrome extension manifest format                            |
| CSP              | Content Security Policy — restricts which resources an extension can load and execute |
| Shadow DOM       | Encapsulated DOM tree that isolates extension UI from page JavaScript                 |
| TTI              | Time to Interactive — web performance metric                                          |
| BYOK             | Bring Your Own Key — users provide their own API keys for LLM providers               |
| ToolGuard        | AGI Workforce's desktop-side tool execution sandbox                                   |
| SecretManager    | AGI Workforce's desktop-side encrypted secret storage                                 |
| MCP              | Model Context Protocol — protocol for connecting AI tools                             |
| CDP              | Chrome DevTools Protocol — low-level browser control protocol                         |
| NM               | Native Messaging — Chrome's extension-to-native-app communication                     |

---

_End of PRD-BROWSER-EXTENSION.md_
_Document version 1.1.0 — Last updated 2026-03-15_
_Generated from codebase analysis of `apps/extension/` and `apps/desktop/src-tauri/src/integrations/native_messaging/`_
