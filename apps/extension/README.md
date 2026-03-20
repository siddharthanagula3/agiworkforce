# Chrome Extension

MV3 service worker + side panel. Native messaging bridge to desktop app.

## Quick Start

```bash
cd apps/extension && pnpm build
# Load unpacked from dist/ in chrome://extensions
```

## Architecture

- **Background**: Service worker (`src/background.ts`)
- **Content scripts**: DOM automation, WebMCP tool discovery
- **Side panel**: Chat interface via HTTP bridge (localhost:8765)
- **Native messaging**: `com.agiworkforce.browser` host
- **Popup**: Connection status, actions, session timer

## Key Features

- WebMCP tool discovery from page DOM
- Browser automation recording
- Scheduled tasks and shortcuts (backend ready, UI pending)
- Native messaging to desktop app
