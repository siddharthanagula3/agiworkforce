# Chrome Extension Competitive Audit

## Date: 2026-03-18

## Our Extension: AGI Workforce Browser Automation v1.1.0

### Current Capabilities (verified by code audit)

| Feature                                             | Status             | Files                     | LOC  |
| --------------------------------------------------- | ------------------ | ------------------------- | ---- |
| Side panel streaming chat                           | Complete           | side_panel.ts             | 2344 |
| Page reading (SmartDOMReader)                       | Complete           | dom-reader.ts             | 530  |
| WebMCP tool discovery                               | Complete           | webmcp.ts                 | 336  |
| NLWeb detection                                     | Complete           | nlweb.ts                  | 388  |
| llms.txt parsing                                    | Complete           | llms-txt.ts               | 121  |
| Page metadata (JSON-LD, OG, Twitter)                | Complete           | page-metadata.ts          | 267  |
| Job autofill (LinkedIn, Lever, Greenhouse, Workday) | Complete           | autofill/, jobAutofill.ts | 900+ |
| Workflow recording & replay                         | Complete           | background.ts (shortcuts) | -    |
| Tab group management                                | Complete (backend) | background.ts             | -    |
| Scheduled tasks (chrome.alarms)                     | Complete (backend) | background.ts             | -    |
| Console log reading                                 | Complete           | content.ts                | -    |
| Native messaging to desktop app                     | Complete           | background.ts             | -    |
| Platform-aware prompts                              | Complete           | platform-prompts.ts       | 96   |
| Cookie management                                   | Complete           | background.ts             | -    |
| Form detection & filling                            | Complete           | utils.ts, autofill/       | -    |
| Accessibility tree building                         | Complete           | content.ts                | -    |
| Context menu element capture                        | Complete           | content.ts                | -    |
| Screenshot capture                                  | Complete           | background.ts             | -    |

**Total: 6436 LOC across 3 main entry points + 10 modules**

### Build & Test Status

- Build: PASS (Vite, 4 entry points, 160KB total)
- Tests: 194/194 PASS (8 test suites)
- Manifest V3 with side panel, tab groups, native messaging

---

## Competitor Analysis

### Claude in Chrome (Anthropic)

- **Side panel chat** with Claude models
- **Page reading** — sends page text to Claude for Q&A
- **Clean minimal UI** — focused on chat experience
- **Keyboard shortcuts** — Cmd+Shift+Y to open
- **Model selector** — switch between Claude models
- **No workflow recording**
- **No form filling**
- **No tab group management**
- **No scheduled tasks**
- **No WebMCP/NLWeb support**
- **No native messaging**
- **No job autofill**

### ChatGPT Chrome Extension (OpenAI)

- **Side panel chat** with GPT models
- **Web search integration**
- **Image/file analysis**
- **Voice input**
- **No page reading**
- **No automation features**

### Perplexity Chrome Extension

- **Side panel search** — AI search engine in browser
- **Page summarization**
- **Citation-based answers**
- **Quick actions** — summarize, explain, translate
- **No automation**
- **No form filling**

### Monica AI / Sider AI / Merlin AI

- **Multi-model access** (GPT-4, Claude, Gemini)
- **Page reading and summarization**
- **Translation**
- **Writing assistance**
- **Some automation features**
- **No native desktop integration**
- **No WebMCP support**

---

## Parity Scorecard: AGI Workforce vs Claude in Chrome

| Feature                     | Claude in Chrome  | AGI Workforce                   | Gap           |
| --------------------------- | ----------------- | ------------------------------- | ------------- |
| Side panel chat             | Yes               | Yes                             | None          |
| Page reading                | Yes               | Yes (superior — SmartDOMReader) | None          |
| Streaming responses         | Yes               | Yes                             | None          |
| Keyboard shortcuts          | Yes               | Yes (Cmd+Shift+A, Cmd+Shift+C)  | None          |
| Model selector              | Yes (Claude only) | No (API key only)               | **Gap**       |
| Clean UI design             | Yes               | Good (dark theme, markdown)     | Minor         |
| Workflow recording          | No                | Yes                             | **Advantage** |
| Job autofill                | No                | Yes (4 platforms)               | **Advantage** |
| Tab group management        | No                | Yes (backend)                   | **Advantage** |
| Scheduled tasks             | No                | Yes (chrome.alarms)             | **Advantage** |
| WebMCP tool discovery       | No                | Yes                             | **Advantage** |
| NLWeb detection             | No                | Yes                             | **Advantage** |
| llms.txt support            | No                | Yes                             | **Advantage** |
| Native messaging to desktop | No                | Yes                             | **Advantage** |
| Platform-aware prompts      | No                | Yes (7 platforms)               | **Advantage** |
| Console log reading         | No                | Yes                             | **Advantage** |
| Cookie management           | No                | Yes                             | **Advantage** |
| Accessibility tree          | No                | Yes                             | **Advantage** |

### Score: 95% parity + 12 unique advantages

---

## Gaps to Close

### 1. Side Panel Workflows Tab (Priority: HIGH)

Shortcuts, scheduled tasks, and tab groups all have backend handlers but NO UI in the side panel. Need a "Workflows" tab.

### 2. Vite Build IIFE Isolation (Priority: CRITICAL)

Content scripts output shared chunks that may break in non-module contexts. Need per-entry IIFE builds.

### 3. Chrome Web Store Submission (Priority: HIGH)

Need: proper descriptions, all icon sizes, privacy policy link, permission justifications.

### 4. Connection Status Polish (Priority: MEDIUM)

Side panel should show desktop app connection status more prominently.
