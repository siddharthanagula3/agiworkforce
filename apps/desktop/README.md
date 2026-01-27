# AGI Workforce Desktop

> AI-powered desktop application for autonomous task completion

The main AGI Workforce application built with Tauri (Rust + React).

## Quick Start

```bash
# From repository root
pnpm install
pnpm dev:desktop
```

Opens at `http://localhost:5173` with hot-reload.

## Technology Stack

| Component | Technology                |
| --------- | ------------------------- |
| Framework | Tauri 2.9                 |
| Backend   | Rust, Tokio, SQLite       |
| Frontend  | React 19, TypeScript 5.9  |
| Build     | Vite 7 with SWC           |
| State     | Zustand v5                |
| Styling   | Tailwind CSS v4, Radix UI |

## Project Structure

```
apps/desktop/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   └── UnifiedAgenticChat/  # Main chat interface
│   ├── stores/             # Zustand state stores
│   ├── hooks/              # React hooks
│   ├── api/                # Tauri command wrappers
│   └── __tests__/          # Unit tests
├── src-tauri/              # Rust backend
│   └── src/
│       ├── sys/            # System commands, security
│       ├── core/           # AGI, LLM, MCP logic
│       ├── data/           # SQLite, settings
│       └── automation/     # Workflow engine
├── e2e/                    # Playwright E2E tests
└── public/                 # Static assets
```

## Commands

### Development

```bash
# Start dev server with hot-reload
pnpm dev

# Type check
pnpm typecheck

# Lint
pnpm lint
```

### Testing

```bash
# Unit tests
pnpm test

# E2E tests (requires build first)
pnpm build && pnpm preview
pnpm test:e2e

# Coverage
pnpm test:coverage
```

### Building

```bash
# Build for production
pnpm build

# Build installer (DMG/MSI/AppImage)
cd ../.. && pnpm build:desktop
```

## Features

- **Chat Interface**: Natural language AI interaction
- **Agent Mode**: Autonomous task completion
- **Browser Automation**: Web task automation
- **Workflow Engine**: Visual automation flows
- **MCP Integration**: Extensible tool ecosystem
- **Multi-model Support**: OpenAI, Anthropic, Google, DeepSeek, xAI, Ollama

## Optional Features

Some features require additional system dependencies:

### OCR (Text Recognition)

The OCR feature uses Tesseract for extracting text from images. It's **disabled by default** because it requires system-level dependencies.

**To enable OCR:**

1. Install Tesseract:

   ```bash
   # macOS
   brew install tesseract

   # Ubuntu/Debian
   sudo apt install tesseract-ocr libtesseract-dev

   # Windows (via vcpkg)
   vcpkg install tesseract
   ```

2. Build with the OCR feature:
   ```bash
   cd apps/desktop/src-tauri
   cargo build --features ocr
   ```

**Note:** The released app does not include OCR to avoid dependency issues for users. Text recognition will be available in a future update with bundled libraries.

## Configuration

### Environment Variables

Create `.env.local` from `.env.example`:

```env
VITE_OPENAI_API_KEY=sk-...
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_GOOGLE_API_KEY=AIza...
VITE_ENABLE_OLLAMA=true
```

### Tauri Configuration

See `src-tauri/tauri.conf.json` for app configuration.

## Database

SQLite database at `~/.config/agiworkforce/agiworkforce.db`:

- WAL mode for concurrency
- 64MB cache
- Foreign keys enabled

Reset database:

```bash
rm -rf ~/.config/agiworkforce/agiworkforce.db
```

## Debugging

### React DevTools

Right-click → Inspect or `Cmd+Shift+I` in dev mode.

### Rust Logs

```bash
RUST_LOG=debug pnpm dev
```

### Zustand DevTools

Redux DevTools extension shows state changes.

## Related Documentation

- [Full Documentation](../../docs/README.md)
- [Architecture](../../ARCHITECTURE.md)
- [Contributing](../../CONTRIBUTING.md)
