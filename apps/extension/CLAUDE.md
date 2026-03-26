# Chrome Extension

Chrome MV3 browser automation extension. Package: `@agiworkforce/extension`, v1.2.0. Min Chrome 132.

## Commands

```bash
pnpm build          # Vite → dist/ (4 entry points)
pnpm test           # Vitest (400 tests)
pnpm lint           # ESLint
npx tsc --noEmit    # Typecheck
```

## Source Structure

- `src/background.ts` — MV3 service worker: native messaging, HTTP bridge, alarms, tab groups
- `src/content.ts` — DOM automation (18 action types), WebMCP discovery, NLWeb, recording
- `src/popup.ts` — Connection status, screenshot capture
- `src/side_panel.ts` — Chat UI: SSE streaming, markdown, workflows tab, scheduled tasks
- `src/types.ts` — 66 discriminated message types
- `src/autofill/` — Job autofill: LinkedIn, Lever, generic ATS
- `src/webmcp.ts` — Declarative + imperative MCP tool discovery
- `src/nlweb.ts` — .well-known/nlweb probing, JSON-LD detection

## Key Patterns

- 60+ message types as discriminated union (NativeMessageType)
- Native messaging host: `com.agiworkforce.browser`
- Side panel HTTP bridge: localhost:8765
- WebMCP: form[tool-name] + navigator.modelContext
- Workflow recording: START_RECORDING → action capture → SAVE_SHORTCUT → REPLAY_SHORTCUT
- Scheduled tasks: chrome.alarms API, restored on MV3 service worker restart

## Don't

- No Node.js APIs in content/background
- `.gitignore` has `*.js` — don't commit compiled JS (except `jobAutofill.runtime.js`)
- Never add permissions beyond what manifest.json declares

## Full Architecture

See `docs/architecture.md`
