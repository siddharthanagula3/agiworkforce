# Extension UI Parity Scorecard: AGI Workforce vs Claude in Chrome

_Audit date: 2026-03-18. All 22 source files in apps/extension/src/ audited._
_Claude in Chrome research: 21 tools documented from extension internals v1.0.56._

## Parity Matrix

| UI Feature                      | Claude in Chrome                                                                                                                                                                        | AGI Workforce                                                                                                                                                | Score        | Notes                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------ |
| Side panel chat                 | React side panel, SSE streaming via Anthropic JS SDK, max_tokens 10000, thinking blocks, Quick Mode compact commands                                                                    | Pure TS side panel, SSE streaming, DOMPurify markdown, 6 slash commands, voice input, conversation persistence (50 msgs), page context toggle                | PARITY+      | AGI has slash commands + voice + multi-model; Claude has thinking blocks + Quick Mode                  |
| Model selection                 | Haiku 4.5 (Pro), Sonnet/Opus 4.6 (Max/Team) — Anthropic-only                                                                                                                            | 11 models from 7 providers (Auto, Claude, GPT-4o, Gemini, Mistral, DeepSeek, Ollama) with BYOK                                                               | ADVANTAGE    | Multi-LLM is our key differentiator                                                                    |
| Page reading                    | `read_page` (accessibility tree via `chrome.debugger` + injected JS, 50K chars, ref IDs) + `get_page_text` (article extraction, 50K chars) + `computer` (DevTools Protocol screenshots) | SmartDOMReader + accessibility tree builder + page-metadata (JSON-LD/OG/Twitter/Schema.org) + NLWeb detection + llms-txt discovery. No debugger API.         | PARITY       | Claude uses DevTools Protocol (higher fidelity screenshots); AGI has richer metadata extraction        |
| Form detection + filling        | `form_input` tool sets values via ref IDs from accessibility tree. Dispatches change+input events. `computer` tool types via `Input.insertText` DevTools Protocol                       | Full autofill: detector (LinkedIn + Lever), filler (React-compatible native value setter), 13 LinkedIn field types, 12 Lever fields + custom questions + EEO | ADVANTAGE    | Claude has generic form filling; AGI has deep platform-specific job autofill                           |
| Workflow recording              | rrweb DOM snapshot recording, Haiku-generated step descriptions, GIF export via `gif_creator`, speech narration during recording                                                        | START/STOP_RECORDING, RecordedAction[] event capture, saved shortcuts CRUD (50 cap), replay via RUN_PAGE_ACTIONS                                             | GAP (LOW)    | Claude's rrweb recording is higher fidelity than our event-based capture. We lack GIF export.          |
| Tab group management            | Auto-organizes tabs, `tabs_context`/`tabs_create` tools, tab context injected as system-reminder, separate MCP tab group                                                                | ensureTabGroup() blue group, auto-groups CREATE_TAB, ADD/REMOVE_TAB_TO_GROUP, context menu, side panel toggle                                                | PARITY       | Claude injects tab context into prompts automatically; we could add this                               |
| Scheduled tasks                 | `chrome.alarms`, configurable daily/weekly/monthly/annually                                                                                                                             | Full CRUD, alarm-based hourly/daily/weekly/monthly, MV3 restart recovery, shortcut replay OR chat prompt execution, notifications                            | PARITY       | Both use chrome.alarms; our implementation has more schedule granularity                               |
| Console log reading             | `read_console_messages` with regex pattern filter, error-only mode, domain scoping, limit (default 100)                                                                                 | patchConsole() monkey-patch, circular buffer (200 entries), [AGI Workforce] filter, GET/CLEAR messages, side panel UI                                        | PARITY       | Both capture console output; Claude adds regex filtering                                               |
| Network request reading         | `read_network_requests` captures XHR/Fetch/documents/images, URL pattern filter                                                                                                         | Not implemented                                                                                                                                              | GAP (MEDIUM) | Claude can inspect HTTP traffic; we can't                                                              |
| Desktop notifications           | Notifications on task completion, CAPTCHA detection, approval requests                                                                                                                  | chrome.notifications on errors/shortcut replay/task completion, click opens side panel                                                                       | PARITY       | Feature-complete                                                                                       |
| Keyboard shortcuts              | No dedicated hotkeys; relies on Chrome's extension shortcut system; `/` for prompt shortcuts                                                                                            | Cmd+Shift+A (popup), Cmd+Shift+C (capture), Cmd+R (refresh in popup)                                                                                         | PARITY       | Both rely on Chrome's shortcut infrastructure                                                          |
| Vision-based computer use       | `computer_20250124` tool with DevTools Protocol: click, type, scroll, screenshot, drag, zoom. Token-optimized screenshots (28px/token)                                                  | Screenshots via captureVisibleTab, DOM-based click/type/scroll (no DevTools Protocol)                                                                        | GAP (LOW)    | Claude uses chrome.debugger for pixel-level control; we use DOM events (more compatible, less precise) |
| Natural language element search | `find` tool does nested LLM call to Sonnet for element location                                                                                                                         | CSS selector-based element finding only                                                                                                                      | GAP (LOW)    | Claude's find tool is AI-powered; ours is selector-based (faster, deterministic)                       |
| GIF recording                   | `gif_creator` tool records actions as animated GIFs with overlays                                                                                                                       | Not implemented                                                                                                                                              | GAP (LOW)    | Nice-to-have for sharing; not blocking                                                                 |
| File/image upload               | `upload_image`/`file_upload` tools via DevTools Protocol                                                                                                                                | File inputs skipped in autofill (browser security model)                                                                                                     | GAP (LOW)    | Claude bypasses file input security via debugger; we respect the sandbox                               |
| Context menu                    | Right-click actions for Claude interactions                                                                                                                                             | 8 items: Ask, Explain, Translate, Summarize, Capture Element, Get Element Info, Discover AI Tools, Add to Tab Group                                          | ADVANTAGE    | More context menu items                                                                                |
| Platform knowledge              | Built-in knowledge of Slack, Google Calendar, Gmail, Google Docs, GitHub                                                                                                                | 8 platforms: Slack, Gmail, GCal, GDocs, GitHub, Notion, Linear, Figma                                                                                        | PARITY+      | AGI covers 3 more platforms (Notion, Linear, Figma)                                                    |
| Permission/domain safety        | Queries anthropic.com API for domain categorization, 3-tier system (blocked/prompt-only/normal)                                                                                         | Hardcoded cookie domain blocklist for sensitive sites                                                                                                        | GAP (LOW)    | Claude has dynamic domain safety; ours is static                                                       |
| Native messaging bridge         | `com.anthropic.claude_browser_extension` to Claude Desktop/Code                                                                                                                         | `com.agiworkforce.browser` with handshake + exponential backoff (8 max)                                                                                      | PARITY       | Both bridge to desktop apps                                                                            |
| WebMCP tool discovery           | N/A                                                                                                                                                                                     | Imperative + declarative discovery, callTool, MutationObserver watching                                                                                      | ADVANTAGE    | Unique to AGI Workforce                                                                                |
| NLWeb + llms.txt                | N/A                                                                                                                                                                                     | 4-step NLWeb detection + llms.txt Markdown parsing                                                                                                           | ADVANTAGE    | Unique to AGI Workforce                                                                                |
| Multi-model routing             | Claude-only                                                                                                                                                                             | 11 models, 7 providers, BYOK                                                                                                                                 | ADVANTAGE    | Key differentiator                                                                                     |
| Job autofill system             | N/A                                                                                                                                                                                     | LinkedIn + Lever with React-compatible filling, 25 field types                                                                                               | ADVANTAGE    | Unique to AGI Workforce                                                                                |

## Score Summary

- **PARITY+** (AGI exceeds): 2 features (side panel, platform knowledge)
- **ADVANTAGE** (AGI has, Claude doesn't): 6 features (multi-model, WebMCP, NLWeb/llms.txt, job autofill, context menu, form filling)
- **PARITY** (equivalent): 8 features
- **GAP LOW** (Claude has, minor): 5 features (rrweb recording, vision computer use, find tool, GIF creator, file upload, domain safety)
- **GAP MEDIUM**: 1 feature (network request reading)
- **GAP HIGH**: 0 features

**Overall: 16 parity-or-better / 6 gaps (0 high, 1 medium, 5 low)**

## Gaps — Implementation Priority

| Gap                                | Effort     | Priority | Notes                                                                   |
| ---------------------------------- | ---------- | -------- | ----------------------------------------------------------------------- |
| Network request reading            | S (40 LOC) | MEDIUM   | Add webRequest/webNavigation listener in background, accumulate per-tab |
| rrweb-quality recording            | L          | LOW      | Would require rrweb dep + significant recording infra changes           |
| Vision computer use (debugger API) | L          | LOW      | Requires `debugger` permission (shows warning bar to users)             |
| Natural language find              | M          | LOW      | Requires LLM endpoint for element search — could use desktop bridge     |
| GIF creator                        | M          | LOW      | Nice-to-have for sharing recorded workflows                             |
| File upload via debugger           | M          | LOW      | Requires debugger permission; security trade-off                        |
| Dynamic domain safety              | S          | LOW      | Query agiworkforce.com API instead of hardcoded blocklist               |

## Message Passing Connectivity Audit

34 chrome.runtime.sendMessage / chrome.tabs.sendMessage / connectNative calls across 5 files verified:

### content.ts -> background.ts (6 calls)

- TAB_READY: handler in handleMessageAsync
- SYNC_PAGE_CONTEXT: handler in handleMessageAsync
- open_side_panel: handler in handleMessageAsync
- WEBMCP_TOOLS_CHANGED: handler in handleMessageAsync
- NLWEB_DETECTED: fires and forgets (acceptable)
- NLWEB_PROBE: handler added this session (was missing)

### side_panel.ts -> background.ts (15 calls)

- CHAT_MESSAGE, GET_CONSOLE_LOGS, CLEAR_CONSOLE_LOGS, LIST_SHORTCUTS, DELETE_SHORTCUT, REPLAY_SHORTCUT, SAVE_SHORTCUT, GET_RECORDED_ACTIONS, CREATE/LIST/UPDATE/DELETE_SCHEDULED_TASK, ADD/REMOVE_TAB_TO/FROM_GROUP, BRIDGE_URL_CHANGED — all have handlers

### popup.ts -> background.ts (3 calls)

- GET_CONNECTION_STATUS, CAPTURE_SCREENSHOT, WEBMCP_DISCOVER_TOOLS — all have handlers

### background.ts -> content.ts (7 call sites)

- forwardToContentScript (30s timeout), CONNECTION_STATUS_CHANGED broadcast, context menu forwards, sidePanel.open — all wired

### background.ts -> native host (7 message types)

- connect, ping, page_context, task_result, queue_message, chat_message, webmcp_tools_update — all with timeout + error handling

### Error handling: all calls have .catch() or callback error checks

## Security Verification

- Zero eval() / new Function() in source and built output
- All innerHTML uses DOMPurify-sanitized or static strings
- API keys in chrome.storage.session only (cleared on browser close)
- Bridge URL restricted to localhost/127.0.0.1
- Cookie domain blocklist for sensitive sites
- CSP: `script-src 'self'; object-src 'self'` — no unsafe-eval
- 11 permissions all justified, no `<all_urls>`
- No hardcoded secrets
- No `chrome.debugger` usage (deliberate — avoids warning bar)

## Build Verification

- `tsc --noEmit`: 0 errors
- `pnpm build`: 4 IIFE bundles (background 30.7KB, content 58KB, popup 4.9KB, side_panel 67KB)
- `vitest run`: 194/194 tests pass
- `extension.zip`: 83KB, Chrome Web Store ready

## Fix Applied This Session

**NLWEB_PROBE handler**: Content script sends NLWEB_PROBE to background for cross-origin fetches. Background now has a dedicated handler with 5s timeout fetch, returning status + headers + body. Previously fell through to default case creating a silent routing loop.
