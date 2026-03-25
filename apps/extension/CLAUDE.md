# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Chrome MV3 extension for AGI Workforce. Bridges the desktop app (Tauri) to the browser via native messaging, provides a side panel chat UI, DOM automation, WebMCP tool discovery, job application autofill, and page context sync.

## Build & Dev Commands

```bash
pnpm dev              # Vite build --watch (rebuild on file change)
pnpm build            # Production build → dist/
pnpm test             # Vitest run (jsdom env)
pnpm lint             # ESLint (uses .cache/eslint for content-based caching)
pnpm package          # Build + zip dist/ into extension.zip (excludes sourcemaps)
```

Load into Chrome: `chrome://extensions` → Developer mode → "Load unpacked" → select `dist/` folder.

Separate lint from monorepo root: `pnpm lint:extension` (root package.json).

## Architecture

### Entry Points (4 Vite rollup inputs)

| File | Context | Role |
|------|---------|------|
| `src/background.ts` | Service worker | Native messaging port (`com.agiworkforce.browser`), message routing between content scripts and desktop, WebMCP/NLWeb catalog per tab, HTTP bridge to localhost for side panel chat, scheduled task alarms, tab group management |
| `src/content.ts` | Content script (all http/https pages) | DOM automation (click, type, scroll, forms, accessibility tree), page context extraction, console log capture, WebMCP tool discovery, SPA navigation watcher, floating overlay/FAB |
| `src/popup.ts` | Action popup (`popup.html`) | Connection status display, screenshot capture, side panel launcher, tab grouping |
| `src/side_panel.ts` | Side panel (`side_panel.html`) | Chat UI with streaming (SSE via HTTP bridge), markdown rendering (DOMPurify), WebMCP tool display, action recording, model selection, API key management |

### Communication Flow

```
Desktop (Tauri) ←→ Native Messaging Port ←→ background.ts ←→ content.ts (chrome.runtime messages)
                                              ↕
                                          side_panel.ts (chrome.runtime messages + CHAT_CHUNK internal msgs)
                                              ↕
                                          HTTP bridge (localhost:8765) for chat streaming
```

- Desktop sends commands → background forwards to content script via `chrome.tabs.sendMessage`
- Content script responses flow back through background → native port → desktop
- Side panel chat sends `CHAT_MESSAGE` to background, which SSE-streams via HTTP bridge, forwarding `CHAT_CHUNK` messages back
- `BRIDGE_URL_CHANGED` message lets side panel update the HTTP bridge URL dynamically

### Key Modules

- **`src/types.ts`** — 60+ message types as a discriminated union (`NativeMessageType`). Every message has a typed request/response pair. `InternalMessageType` for extension-internal messages (e.g., `CHAT_CHUNK`).
- **`src/utils.ts`** — `logger`, `RateLimiter` (120 req/min, 500ms screenshot cooldown), `domUtils`, `formUtils`, `storageUtils`, `validators` (URL safety, selector validation).
- **`src/webmcp.ts`** — WebMCP tool discovery: declarative (HTML `tool-name` attributes on forms) and imperative (`window.__WEBMCP__` API). Reports discovered tools to background for desktop catalog.
- **`src/nlweb.ts`** — NLWeb protocol detection: probes `/.well-known/nlweb.json` and scans JSON-LD for SearchAction/AskAction schemas.
- **`src/page-metadata.ts`** — Extracts structured metadata: JSON-LD, Open Graph, Twitter Card, Schema.org types, canonical URLs.
- **`src/platform-prompts.ts`** — Platform-specific prompts for known sites (Slack, Gmail, Calendar, Docs, GitHub, etc.) with navigation shortcuts and DOM selectors.
- **`src/jobAutofill.ts`** — Entry point for job application autofill, delegates to platform-specific fillers.
- **`src/autofill/`** — Platform-specific autofill: `detector.ts` (LinkedIn/Lever detection), `linkedin.ts`, `lever.ts`, `filler.ts` (generic form filling).

### Native Messaging

- Host name: `com.agiworkforce.browser`
- Messages use an envelope format: `{ id, type, success?, error?, data? }`
- Pending requests tracked in a `Map` with timeouts (10s default for native, 30s for content script forwarding)
- Exponential backoff reconnect: base 1s, max 30s, 8 attempts max. Gives up to prevent macOS permission popup loops.
- Manual reconnect via `RECONNECT_NATIVE` message resets all retry state.

## Testing

- Framework: Vitest with jsdom environment (default URL: `https://acme.myworkdayjobs.com/en-US/careers`)
- Tests in `__tests__/` — covers WebMCP discovery, content script automation, utils, side panel markdown, connection lifecycle, bridge URL validation, background reconnect, cookies, page metadata, job autofill runtime
- `restoreMocks: true` in vitest config — mocks auto-restore between tests
- Chrome API mocks: tests must mock `chrome.runtime`, `chrome.tabs`, `chrome.storage`, etc. since jsdom has no Chrome extension APIs

## Gotchas

- **MV3 service worker lifecycle**: Background script can be terminated by Chrome at any time. All state in `background.ts` is ephemeral — persistent state goes to `chrome.storage.local` (shortcuts, tasks) or `chrome.storage.session` (API key).
- **Content script CSP**: DOM injections (indicator, overlay) are wrapped in try/catch because CSP-restricted or XML/SVG pages will throw.
- **`host_permissions`**: Only `localhost` and `127.0.0.1` — the extension does NOT have broad host access. WebMCP probes to cross-origin URLs go through background script fetch.
- **Chunk file naming**: `chunkFileNames: 'assets/[name].js'` (no hash) — stable names for Chrome extension review. Content scripts resolve module imports within extension context (Chrome 125+, min version 132).
- **Internal vs native messages**: `CHAT_CHUNK` is `InternalMessageType` — it flows between extension contexts only, never to the native host. Don't add it to `NativeMessageType`.
- **Rate limiting**: Background applies per-tab rate limits (120/min) and screenshot cooldown (500ms). Content script has separate `MAX_CONTEXT_HTML_CHARS` (100K) and `MAX_CONSOLE_BUFFER` (200) limits.
- **SPA navigation**: Content script watches `popstate`, `hashchange`, `replaceState`, and `pushState` to re-sync page context on single-page app navigations.
