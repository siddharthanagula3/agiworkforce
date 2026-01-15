# AGI Workforce

[![Version](https://img.shields.io/badge/version-1.0.4-blue.svg)](https://github.com/siddhartha/agiworkforce)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange.svg)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2.9-yellow.svg)](https://tauri.app/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)

> Enterprise-grade AI automation platform with autonomous agents, intelligent workflows, and multi-platform support. Built with Tauri, React 19, and Rust for maximum performance and security.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Overview

**AGI Workforce** is a comprehensive AI automation platform designed for developers, teams, and enterprises. It combines powerful autonomous agents, intelligent workflow automation, and seamless multi-platform synchronization in a single unified experience.

### What Makes AGI Workforce Different?

- **Autonomous AGI Agents**: Self-directed reasoning loops that plan, execute, and adapt to achieve complex goals
- **Native Desktop Performance**: Built with Rust and Tauri for blazing-fast native performance
- **Modern React 19**: Leveraging latest React features including Server Components and enhanced hooks
- **Multi-Platform Sync**: Seamless synchronization between desktop and web with real-time updates
- **MCP Integration**: Full Model Context Protocol support for extensible AI tool ecosystems
- **Enterprise Security**: Built-in encryption, audit logging, and granular permission controls

## Key Features

### 🤖 Autonomous AGI System

- **Self-Directed Reasoning**: Agents plan and execute complex multi-step tasks autonomously
- **Goal-Oriented**: Set high-level objectives and let agents determine optimal approaches
- **Safety Limits**: Built-in timeouts, iteration limits, and failure handling
- **Process Reasoning**: Advanced planning with dependency tracking and parallel execution
- **Learning System**: Agents learn from outcomes and improve over time

### 🔧 Powerful Automation

- **Visual Workflow Builder**: Drag-and-drop interface powered by @xyflow/react
- **Computer Use**: AI-controlled keyboard, mouse, and screen interaction
- **Browser Automation**: Semantic web automation with CDP and Playwright integration
- **Terminal Integration**: AI-assisted command execution with xterm.js
- **File Operations**: Intelligent file management and code generation

### 💬 Advanced Chat Interface

- **Multi-Provider Support**: OpenAI, Anthropic, Google, DeepSeek, xAI, Ollama, and more
- **Streaming Responses**: Real-time token streaming with SSE parsing
- **Vision Support**: Image analysis and multimodal conversations
- **Cost Tracking**: Automatic usage and cost calculation per provider
- **Context Management**: Intelligent context window management with automatic compaction

### 🔌 MCP (Model Context Protocol) Support

- **Server Management**: Start, stop, and configure MCP servers
- **Tool Discovery**: Automatic discovery and registration of MCP tools
- **HTTP Transport**: Support for both stdio and HTTP transport layers
- **Credential Management**: Secure credential storage in OS keyring
- **Session Management**: Persistent sessions with automatic reconnection

### 🔐 Enterprise Security

- **End-to-End Encryption**: AES-GCM encryption for sensitive data
- **OS Keyring Integration**: Secure credential storage using native OS keychains
- **Audit Logging**: Comprehensive activity tracking and compliance reporting
- **Role-Based Access**: Granular permission controls for teams
- **Rate Limiting**: Built-in rate limiting with Upstash Redis

### 📊 Analytics & Monitoring

- **Real-Time Metrics**: Live dashboard with usage statistics
- **Cost Tracking**: Per-provider and per-model cost breakdown
- **Performance Monitoring**: Latency tracking and optimization insights
- **ROI Calculator**: Measure time and cost savings from automation

### 🌐 Multi-Platform

- **Desktop Apps**: Native macOS, Windows, and Linux applications
- **Web Platform**: Next.js 16 SaaS with Supabase backend
- **Real-Time Sync**: WebSocket-based synchronization between devices
- **Offline Support**: Full functionality with local SQLite database

## Architecture

### Tech Stack

**Desktop Application:**

- **Frontend**: React 19, TypeScript 5.9, Vite 7 with SWC
- **Backend**: Rust with Tauri 2.9, Tokio async runtime
- **State Management**: Zustand v5 with devtools, persist, and subscribeWithSelector
- **UI Components**: Radix UI + Tailwind CSS v4 (CSS-first configuration)
- **Database**: SQLite with Write-Ahead Logging (WAL)

**Web Application:**

- **Framework**: Next.js 16 with React 19 Server Components
- **Database**: Supabase PostgreSQL with Row Level Security
- **Authentication**: Supabase Auth with JWT
- **Styling**: Tailwind CSS v4 (CSS-first)
- **State Management**: React Query v5 for server state

**Backend Services:**

- **API Gateway**: Express.js with JWT authentication (port 3000)
- **Signaling Server**: WebSocket server for real-time sync (port 4000)
- **Message Queue**: Redis for distributed task queue
- **Payment Processing**: Stripe with webhook idempotency

**AI/ML Infrastructure:**

- **LLM Router**: Multi-provider intelligent routing with cost optimization
- **Token Counter**: Accurate token counting per provider (cl100k_base, o200k_base)
- **Embeddings**: Vector embeddings for semantic search
- **Vision Pipeline**: Image processing with OCR support (Tesseract)

### Monorepo Structure

```
agiworkforce/
├── apps/
│   ├── desktop/              # Tauri desktop application
│   │   ├── src/              # React frontend (TypeScript)
│   │   ├── src-tauri/        # Rust backend
│   │   │   ├── src/
│   │   │   │   ├── sys/      # System commands & security
│   │   │   │   ├── core/     # Business logic (AGI, agents, MCP, LLM)
│   │   │   │   ├── data/     # Data access layer
│   │   │   │   ├── automation/ # Workflow automation
│   │   │   │   ├── integrations/ # Third-party APIs
│   │   │   │   └── features/ # Feature modules
│   │   │   └── tests/        # Integration tests
│   │   └── e2e/              # Playwright E2E tests
│   ├── web/                  # Next.js web application
│   │   ├── app/              # React Server Components
│   │   ├── lib/              # Business logic & utilities
│   │   ├── __tests__/        # Vitest tests
│   │   └── supabase/         # Database migrations
│   └── extension/            # Browser extension
├── services/
│   ├── api-gateway/          # Express.js REST API
│   └── signaling-server/     # WebSocket signaling server
├── packages/
│   ├── types/                # Shared TypeScript types
│   └── utils/                # Shared utilities
└── docs/                     # Documentation
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Desktop App                             │
│  ┌──────────────┐         ┌─────────────┐      ┌──────────┐    │
│  │ React UI     │◄────────┤ Tauri Bridge├─────►│ Rust     │    │
│  │ (TypeScript) │         └─────────────┘      │ Backend  │    │
│  └──────────────┘                              └──────────┘    │
│       │                                              │          │
│       │ Invoke Commands                              │          │
│       ▼                                              ▼          │
│  ┌──────────────┐                          ┌────────────────┐  │
│  │ Zustand Store│                          │ SQLite DB      │  │
│  └──────────────┘                          │ (WAL mode)     │  │
│                                            └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Signaling Server (WS)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Device Sync
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Web App                                 │
│  ┌──────────────┐         ┌─────────────┐      ┌──────────┐    │
│  │ React        │◄────────┤ Next.js API ├─────►│ Supabase │    │
│  │ Components   │         │ Routes      │      │ Postgres │    │
│  └──────────────┘         └─────────────┘      └──────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- **Node.js**: 22.12.0 or higher
- **pnpm**: 9.15.0 or higher
- **Rust**: 1.75 or higher (for desktop development)
- **Git**: Latest version

### Installation

1. **Clone the repository:**

```bash
git clone https://github.com/siddhartha/agiworkforce.git
cd agiworkforce
```

2. **Install dependencies:**

```bash
pnpm install
```

3. **Set up environment variables:**

```bash
# Desktop app
cp apps/desktop/.env.example apps/desktop/.env.local

# Web app
cp apps/web/.env.example apps/web/.env.local

# Services
cp services/api-gateway/.env.example services/api-gateway/.env
cp services/signaling-server/.env.example services/signaling-server/.env
```

4. **Configure your API keys:**

Edit the `.env.local` files with your API keys:

- OpenAI API key
- Anthropic API key
- Google AI API key
- Supabase URL and keys
- Stripe keys (for web app)

### Quick Start

**Desktop Development:**

```bash
pnpm dev:desktop
```

This starts the desktop app with hot-reload enabled at `http://localhost:5173`.

**Web Development:**

```bash
cd apps/web
pnpm dev
```

This starts the Next.js dev server at `http://localhost:3001`.

**Backend Services:**

```bash
# In separate terminals:
pnpm --filter @agiworkforce/api-gateway dev
pnpm --filter @agiworkforce/signaling-server dev
```

## Development

### Project Commands

```bash
# Development
pnpm dev:desktop              # Start desktop app in dev mode
pnpm --filter web dev         # Start web app

# Code Quality
pnpm lint                     # Lint all code
pnpm lint:fix                 # Fix lint issues
pnpm format                   # Format with Prettier
pnpm format:check             # Check formatting
pnpm typecheck:all            # Type check all packages

# Testing
pnpm test                     # Run all tests
pnpm --filter @agiworkforce/desktop test:e2e  # E2E tests
pnpm --filter @agiworkforce/desktop test:coverage  # Coverage

# Building
pnpm build                    # Build all packages (except desktop)
pnpm build:desktop            # Build desktop app (DMG/EXE/AppImage)

# Cleanup
pnpm clean:build              # Remove dist directories
pnpm clean                    # Full clean (node_modules + dist)
```

### Development Workflow

1. **Create a feature branch:**

```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes with proper commits:**

```bash
git add .
git commit -m "feat: add new feature"
```

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `test:` - Test changes
- `chore:` - Build/tooling changes

3. **Run tests before pushing:**

```bash
pnpm typecheck:all
pnpm lint
pnpm test
```

4. **Push and create a pull request:**

```bash
git push origin feature/your-feature-name
```

### Code Style

- **TypeScript**: Strict mode enabled, ES2020 target
- **Prettier**: Single quotes, semicolons, trailing commas, 100 char width
- **ESLint**: React, TypeScript, and Import plugins
- **Rust**: Standard formatting with `rustfmt`, clippy lints enabled

Pre-commit hooks automatically format and lint your code.

## Testing

### Unit & Integration Tests (Vitest)

```bash
# Run all tests
pnpm test

# Run tests for specific app
pnpm --filter @agiworkforce/desktop test
pnpm --filter web test

# Run with UI
pnpm --filter @agiworkforce/desktop test:ui

# Run with coverage
pnpm --filter @agiworkforce/desktop test:coverage
```

### E2E Tests (Playwright)

```bash
# Run all E2E tests
pnpm --filter @agiworkforce/desktop test:e2e

# Run with UI mode
pnpm --filter @agiworkforce/desktop test:e2e -- --ui

# Run specific test project
pnpm --filter @agiworkforce/desktop test:e2e -- --project=smoke
pnpm --filter @agiworkforce/desktop test:e2e -- --project=chat
```

Test projects:

- `smoke` - Critical path smoke tests
- `chat` - Chat interface tests
- `automation` - Workflow automation tests
- `agi` - AGI system tests
- `settings` - Settings and configuration tests
- `visual` - Visual regression tests

### Test Structure

```
apps/desktop/
├── __tests__/              # Unit tests
│   ├── components/
│   ├── hooks/
│   └── utils/
└── e2e/                    # E2E tests
    ├── smoke.spec.ts
    ├── chat.spec.ts
    ├── automation.spec.ts
    └── agi.spec.ts
```

## Deployment

### Desktop Application

**macOS:**

```bash
pnpm build:desktop
# Output: apps/desktop/src-tauri/target/release/bundle/dmg/
```

**Windows:**

```bash
pnpm build:desktop
# Output: apps/desktop/src-tauri/target/release/bundle/msi/
```

**Linux:**

```bash
pnpm build:desktop
# Output: apps/desktop/src-tauri/target/release/bundle/appimage/
```

### Web Application (Vercel)

The web app automatically deploys to Vercel on push to `main` branch.

**Manual deployment:**

```bash
cd apps/web
vercel deploy --prod
```

**Environment variables required:**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### Backend Services

Deploy services to your preferred platform (AWS, Railway, Render, etc.):

```bash
# Build services
pnpm --filter @agiworkforce/api-gateway build
pnpm --filter @agiworkforce/signaling-server build

# Start in production
NODE_ENV=production node dist/index.js
```

## Documentation

### User Documentation

- **[Quick Start Guide](docs/QUICK_START.md)** - Get started in 5 minutes
- **[Getting Started Guide](docs/GETTING_STARTED.md)** - Complete setup and tutorials
- **[User Guide](docs/USER_GUIDE.md)** - Comprehensive user manual
- **[Features Guide](docs/FEATURES.md)** - All features explained
- **[FAQ](docs/FAQ.md)** - Frequently asked questions
- **[Keyboard Shortcuts](docs/KEYBOARD_SHORTCUTS.md)** - Productivity shortcuts
- **[Video Tutorials](docs/VIDEO_TUTORIAL_SCRIPTS.md)** - Video learning resources
- **[Documentation Index](docs/DOCUMENTATION_INDEX.md)** - Complete navigation

### Developer Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Detailed system architecture
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contribution guidelines
- **[CLAUDE.md](CLAUDE.md)** - AI assistant development guide
- **[CHANGELOG.md](docs/CHANGELOG.md)** - Version history and changes
- **[API Reference](apps/web/API_DOCUMENTATION.md)** - API documentation
- **[docs/](docs/)** - Additional technical documentation

### Key Documentation

- **Security**: Encryption, authentication, audit logging
- **AGI System**: Autonomous agents, reasoning loops, planning
- **MCP Integration**: Model Context Protocol setup and usage
- **Stripe Integration**: Payment processing, webhooks, subscriptions
- **Database Schema**: Tables, RLS policies, migrations
- **API Reference**: Tauri commands, REST endpoints, WebSocket protocol

## Troubleshooting

### Desktop App Won't Start

**Issue**: Desktop app fails to start or shows a blank screen.

**Solutions:**

1. Clear the local database: `rm -rf ~/.config/agiworkforce/agiworkforce.db`
2. Clear cache: `rm -rf apps/desktop/node_modules/.vite`
3. Reinstall dependencies: `pnpm clean && pnpm install`
4. Check for Rust compiler issues: `cargo clean` in `apps/desktop/src-tauri`

### Build Errors

**Issue**: Build fails with TypeScript or Rust errors.

**Solutions:**

1. Run type check: `pnpm typecheck:all`
2. Clear build artifacts: `pnpm clean:build`
3. Update Rust: `rustup update stable`
4. Verify Node version: `node --version` (should be 22.12.0+)

### Database Migration Errors

**Issue**: Supabase migrations fail or database is out of sync.

**Solutions:**

1. Check migration files in `apps/web/supabase/migrations/`
2. Reset local database: `supabase db reset`
3. Manually apply migration: `supabase db push`
4. Check Supabase dashboard for schema issues

### API Key Issues

**Issue**: AI providers return authentication errors.

**Solutions:**

1. Verify API keys in `.env.local` files
2. Check API key permissions and quotas
3. Ensure keys don't have trailing whitespace
4. Test keys with provider's API directly

### WebSocket Connection Fails

**Issue**: Real-time sync doesn't work between devices.

**Solutions:**

1. Check signaling server is running: `pnpm --filter @agiworkforce/signaling-server dev`
2. Verify WebSocket URL in configuration
3. Check firewall settings (port 4000)
4. Enable WebSocket debugging in DevTools Network tab

### Performance Issues

**Issue**: App is slow or unresponsive.

**Solutions:**

1. Check SQLite database size: `ls -lh ~/.config/agiworkforce/agiworkforce.db`
2. Optimize database: Run `PRAGMA optimize` in SQLite
3. Clear LLM response cache
4. Reduce token context window in settings
5. Check system resources with Activity Monitor/Task Manager

### E2E Tests Failing

**Issue**: Playwright tests fail locally.

**Solutions:**

1. Install Playwright browsers: `npx playwright install`
2. Start dev server: `pnpm dev:desktop` (must be running on port 5175)
3. Run tests with UI: `pnpm --filter @agiworkforce/desktop test:e2e -- --ui`
4. Check screenshots in `apps/desktop/test-results/`

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

### Quick Contribution Guide

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run the full test suite
5. Submit a pull request

### Code of Conduct

- Be respectful and inclusive
- Write clear, maintainable code
- Add tests for new features
- Update documentation as needed
- Follow the established code style

## Community

- **GitHub Issues**: Bug reports and feature requests
- **Discussions**: Questions and community support
- **Discord**: Real-time chat (coming soon)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Built with amazing open-source technologies:

- [Tauri](https://tauri.app/) - Cross-platform desktop framework
- [React](https://react.dev/) - UI library
- [Next.js](https://nextjs.org/) - React framework
- [Rust](https://www.rust-lang.org/) - Systems programming language
- [Supabase](https://supabase.com/) - Backend-as-a-Service
- [Stripe](https://stripe.com/) - Payment processing
- [Zustand](https://github.com/pmndrs/zustand) - State management
- [Radix UI](https://www.radix-ui.com/) - UI components
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS

---

**Built with ❤️ by AGI Automation LLC**

[Website](https://agiworkforce.com) • [Documentation](https://docs.agiworkforce.com) • [GitHub](https://github.com/siddhartha/agiworkforce)
