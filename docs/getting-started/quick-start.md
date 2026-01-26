# Quick Start Guide

Get AGI Workforce running in 5 minutes.

## Prerequisites

- **Node.js** 22.12.0+ ([Download](https://nodejs.org/))
- **pnpm** 9.15.3+ (`npm install -g pnpm`)
- **Rust** 1.75+ ([Install](https://rustup.rs/)) - for development only
- **Git** ([Download](https://git-scm.com/))

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/siddhartha/agiworkforce.git
cd agiworkforce
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment

```bash
cp apps/desktop/.env.example apps/desktop/.env.local
```

Edit `apps/desktop/.env.local` and add your API keys:

```env
VITE_OPENAI_API_KEY=sk-...
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Start the Desktop App

```bash
pnpm dev:desktop
```

The app will open at `http://localhost:5173` with hot-reload enabled.

## First Steps

### 1. Configure API Keys

Go to **Settings** (gear icon) and add your LLM provider API keys:

- OpenAI (GPT-4, GPT-4o)
- Anthropic (Claude)
- Google (Gemini)
- Or use local models via Ollama

### 2. Start a Conversation

1. Click **New Chat**
2. Type a message and press Enter
3. The AI will respond using your configured model

### 3. Try Agent Mode

1. Toggle **Agent Mode** in the chat settings
2. Give a complex task: "Research the top 5 JavaScript frameworks and summarize their pros/cons"
3. Watch the AI plan and execute the task autonomously

### 4. Explore Features

- **Browser Automation**: Ask the AI to navigate websites
- **Terminal**: Execute shell commands with AI assistance
- **Code Editor**: Generate and edit code
- **Workflows**: Create visual automation flows

## Common Commands

```bash
# Development
pnpm dev:desktop              # Start desktop app
pnpm dev:web                  # Start web app (cd apps/web first)

# Quality
pnpm lint                     # Check code quality
pnpm typecheck:all            # Type check all packages
pnpm test                     # Run tests

# Building
pnpm build:desktop            # Build desktop installer
```

## Troubleshooting

### App won't start

1. Check Node.js version: `node --version` (need 22.12.0+)
2. Clear cache: `rm -rf apps/desktop/node_modules/.vite`
3. Reinstall: `pnpm install`

### API calls fail

1. Verify API keys in Settings
2. Check your API provider's usage limits
3. Try a different model/provider

### Rust compilation errors

1. Update Rust: `rustup update`
2. Clean build: `cd apps/desktop/src-tauri && cargo clean`

## Next Steps

- [Detailed Installation](installation.md) - System requirements and setup
- [Configuration Guide](configuration.md) - All configuration options
- [Features Overview](../features/README.md) - Explore all features
- [Architecture](../architecture/overview.md) - Understand the system design
