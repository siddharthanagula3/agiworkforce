# AGI Workforce Desktop App

The main Tauri-based desktop application for AGI Workforce.

## Quick Start

```bash
# From repository root
pnpm dev:desktop

# Or from this directory
pnpm dev
```

## Structure

- `src/`: React frontend (components, pages, stores, services, api, utils, types)
- `src-tauri/`: Rust backend (Tauri commands, event emitters, business logic)
- `e2e/`: Playwright end-to-end tests
- `playwright/`: Additional Playwright test suites

## Environment Setup

1. Copy `.env.example` to `.env`
2. Add your API keys:
   - `VITE_OPENAI_API_KEY`
   - `VITE_ANTHROPIC_API_KEY`
   - `VITE_GOOGLE_API_KEY`
   - `VITE_ENABLE_OLLAMA` (optional, for local LLM)

3. Configure MCP servers (optional):
   - Copy `mcp-servers-config.example.json` to `mcp-servers-config.json`
   - Configure your MCP server connections

## Development

```bash
pnpm dev          # Vite + Tauri dev server
pnpm build        # Production build
pnpm test         # Vitest unit tests
pnpm test:e2e     # Playwright E2E tests
pnpm typecheck    # TypeScript check
pnpm lint:fix      # Fix linting issues
```

## Notes

- Rust toolchain pinned to 1.90.0 (see `rust-toolchain.toml`)
- Builds are unsigned; no auto-updater configured
- Approval workflow prompts for dangerous tools when safe mode is enabled
- See main [README.md](../../README.md) for full documentation

## Supported AI Providers

### Google (Gemini)

- **Chat/Text:** Gemini 1.5 Pro, 1.5 Flash, 2.5 Pro (preview) via `generativelanguage.googleapis.com`
- **Vision:** Multimodal support (Images, Video files)
- **Image Generation:** Google Imagen 3 (Pro & Lite)
- **Video Generation:** Google Veo (Preview)
- **Authentication:** API Key (`VITE_GOOGLE_API_KEY` or Settings)
