# Development Setup

Complete guide to setting up the AGI Workforce development environment.

## Prerequisites

| Component | Requirement |
| --------- | ----------- |
| Node.js   | 22.12.0+    |
| pnpm      | 9.15.3+     |
| Rust      | 1.75+       |
| Git       | Latest      |

## Quick Setup

```bash
# Clone repository
git clone https://github.com/siddhartha/agiworkforce.git
cd agiworkforce

# Install dependencies
pnpm install

# Configure environment
cp apps/desktop/.env.example apps/desktop/.env.local

# Start development
pnpm dev:desktop
```

## Development Commands

### Desktop App

```bash
# Start with hot-reload (http://localhost:5173)
pnpm dev:desktop

# Type check
pnpm --filter @agiworkforce/desktop typecheck

# Run tests
pnpm --filter @agiworkforce/desktop test

# Build installer
pnpm build:desktop
```

### Web App

```bash
# Start (http://localhost:3001)
cd apps/web && pnpm dev

# Type check
pnpm --filter web typecheck

# Run tests
pnpm --filter web test

# Build
pnpm --filter web build
```

### Backend Services

```bash
# API Gateway (port 3000)
pnpm --filter @agiworkforce/api-gateway dev

# Signaling Server (port 4000)
pnpm --filter @agiworkforce/signaling-server dev
```

## Code Quality

```bash
# Lint all code
pnpm lint

# Fix lint issues
pnpm lint:fix

# Format code
pnpm format

# Type check all packages
pnpm typecheck:all
```

## Rust Development

```bash
# Format Rust code
cd apps/desktop/src-tauri && cargo fmt

# Run clippy
cargo clippy

# Run tests
cargo test

# Clean build
cargo clean
```

## Project Structure

```
agiworkforce/
├── apps/
│   ├── desktop/            # Tauri app (main)
│   ├── web/                # Next.js platform
│   └── extension/          # Browser extension
├── services/
│   ├── api-gateway/        # REST API
│   └── signaling-server/   # WebSocket
├── packages/
│   ├── types/              # Shared types
│   └── utils/              # Shared utilities
└── docs/                   # Documentation
```

## Environment Files

### Desktop (`apps/desktop/.env.local`)

```env
VITE_OPENAI_API_KEY=sk-...
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_GOOGLE_API_KEY=AIza...
VITE_ENABLE_OLLAMA=true
```

### Web (`apps/web/.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_...
```

## IDE Setup

### VS Code Extensions

- **Rust Analyzer** - Rust language support
- **ESLint** - JavaScript/TypeScript linting
- **Prettier** - Code formatting
- **Tailwind CSS IntelliSense** - CSS class completion
- **Tauri** - Tauri development tools

### Recommended Settings

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.preferences.importModuleSpecifier": "relative",
  "rust-analyzer.cargo.features": "all"
}
```

## Troubleshooting

### pnpm install fails

```bash
pnpm store prune
pnpm clean
pnpm install
```

### Rust compilation errors

```bash
rustup update
cd apps/desktop/src-tauri && cargo clean
```

### Port already in use

```bash
lsof -ti:5173 | xargs kill -9
```

### Database issues

```bash
rm -rf ~/.config/agiworkforce/agiworkforce.db
```

## Next Steps

- [Testing Guide](testing.md)
- [Debugging Guide](debugging.md)
- [Contributing](../../CONTRIBUTING.md)
