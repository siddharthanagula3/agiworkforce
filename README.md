# AGI Workforce Desktop (Beta)

**An AI-Powered Desktop Automation Platform**
_Built with Tauri 2.0, Rust, React 18, and TypeScript_

[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.90-orange)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18-blue)](https://reactjs.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**Status:** Beta (Active Development - November 2025)

**Latest Update (Nov 21, 2025):** Grand Unification refactor complete! Chat experience now features Claude Desktop-inspired UI with centered layout, floating input, and streamlined agent feedback.

---

## What is AGI Workforce?

AGI Workforce is a desktop automation platform that combines AI language models with system automation tools. It provides a chat interface where you can describe tasks in natural language, and the system attempts to execute them using a combination of:

- **Natural Language Processing** - Processes your requests using LLM providers
- **Desktop Automation** - Controls UI elements via Windows UI Automation
- **Code Execution** - Runs terminal commands and scripts
- **Browser Control** - Automates web tasks via Playwright
- **File Operations** - Reads, writes, and modifies files
- **API Integration** - Makes HTTP requests to external services

### Core Capabilities

**1. Software Development Tasks**

- Generate code components and boilerplate
- Run build commands and tests
- Modify existing code files
- Execute npm/cargo/git commands

**2. Desktop Automation**

- Click UI elements by coordinates or text
- Type text into input fields
- Take screenshots for analysis
- Extract text via OCR

**3. Web Automation**

- Navigate to URLs
- Interact with web pages
- Extract data from websites
- Fill forms automatically

**4. File Management**

- Read and write files
- Organize and process documents
- Extract data from various formats

**5. System Tasks**

- Execute shell commands
- Monitor system resources
- Manage processes

---

## Quick Start

### Prerequisites

- **Node.js:** 20.11.0+ (use `nvm use` to auto-switch)
- **pnpm:** 9.15.0+ (install: `npm install -g pnpm@9.15.3`)
- **Rust:** 1.90+ (automatically managed via `rust-toolchain.toml`)
- **Windows 10/11** (Primary supported platform)

### Installation

#### Step 1: Clone the Repository

```bash
git clone https://github.com/siddharthanagula3/agiworkforce-desktop-app.git
cd agiworkforce-desktop-app
```

#### Step 2: Install Dependencies

```bash
pnpm install
```

#### Step 3: Run in Development Mode

```bash
pnpm --filter @agiworkforce/desktop dev
```

The app will open automatically with hot reload enabled.

#### Step 4: Configure LLM Provider

1. Open Settings in the app
2. Add at least one API key:
   - **OpenAI:** https://platform.openai.com/api-keys
   - **Anthropic:** https://console.anthropic.com/
   - **Google:** https://makersuite.google.com/app/apikey
   - **Ollama:** https://ollama.com (local, no key needed)

### Production Build

```bash
pnpm --filter @agiworkforce/desktop build
```

Executable location: `apps/desktop/src-tauri/target/release/agiworkforce-desktop.exe`

---

## Key Features

### 1. Multi-Provider LLM Support

Connect to multiple LLM providers with automatic routing:

- **OpenAI:** GPT-4o, GPT-4o-mini, GPT-5
- **Anthropic:** Claude Sonnet 4.5, Claude Haiku 4.5, Claude Opus 4.1
- **Google:** Gemini 2.5 Pro, Gemini 2.5 Flash
- **Ollama:** Local LLMs (Llama 4, Mistral, etc.) - Free, runs locally
- **xAI:** Grok 4.1, Grok 4.1 Fast
- **Moonshot:** Kimi K2 Thinking
- **DeepSeek:** DeepSeek V3, DeepSeek Coder V3
- **Qwen:** Qwen2.5-Max, Qwen3-Coder
- **Mistral:** Mistral Large 2, Codestral

The system can automatically select the appropriate provider based on task requirements. Latest models from November 2025 are included.

### 2. Unified Chat Architecture

**Grand Unification (Nov 21, 2025):** The chat experience has been consolidated into a single, Claude Desktop-inspired architecture:

- **Unified Store:** `unifiedChatStore` - Single source of truth for all chat state
- **Unified UI:** `UnifiedAgenticChat` - Centered column layout with floating input
- **Real-time Streaming:** See responses as they generate with "Thinking..." indicator
- **Agent Status:** Floating pill showing current agent step/goal
- **Model Selection:** Quick model selector integrated in input area
- **Tool Execution:** Automatic tool calling with visual feedback

### 3. 19 Automation Tools

The platform includes tools for various automation tasks:

**File Operations:**

- `file_read` - Read file contents
- `file_write` - Create or modify files

**UI Automation (Windows):**

- `ui_screenshot` - Capture screen regions
- `ui_click` - Click UI elements
- `ui_type` - Type text input

**Visual Processing:**

- `image_ocr` - Extract text from images

**Browser Automation:**

- `browser_navigate` - Control web browsers

**Code Execution:**

- `code_execute` - Run shell commands

**Database:**

- `db_query` - Query PostgreSQL, MySQL, MongoDB, Redis

**API Integration:**

- `api_call` - Make HTTP requests

**Code Analysis:**

- `code_analyze` - Analyze code structure

### 4. Agent System

The agent system includes:

- **Planning** - Breaks down tasks into steps
- **Execution** - Runs steps with error handling
- **Knowledge Base** - SQLite database for storing task patterns
- **Resource Monitoring** - Tracks CPU, memory, network usage

### 5. Advanced Features

- **Real-time streaming** - See LLM responses as they generate
- **Function calling** - LLMs can invoke tools directly
- **Secure credentials** - Windows Credential Manager integration
- **Context management** - Automatic conversation summarization
- **Error boundaries** - Graceful error handling in UI

---

## Architecture

### Tech Stack

**Frontend:**

- React 18 + TypeScript 5.4+
- Zustand (state management)
- Radix UI + Tailwind CSS
- Monaco Editor (code editing)
- xterm.js (terminal)

**Backend:**

- Tauri 2.0 (desktop framework)
- Rust 1.90+
- Tokio (async runtime)
- rusqlite (database)
- reqwest (HTTP client)
- windows-rs (Windows API)

**LLM Integration:**

- Multi-provider router
- SSE streaming support
- Function calling
- Response caching
- Cost tracking

### Project Structure

```
agiworkforce-desktop-app/
├── apps/desktop/
│   ├── src/                  # React frontend
│   │   ├── components/       # UI components
│   │   ├── stores/           # State management
│   │   └── hooks/            # Custom hooks
│   └── src-tauri/            # Rust backend
│       └── src/
│           ├── agi/          # Agent system
│           ├── automation/   # UI automation
│           ├── browser/      # Browser control
│           ├── commands/     # Tauri commands
│           ├── router/       # LLM router
│           └── db/           # Database
├── packages/
│   ├── types/                # Shared types
│   └── ui-components/        # Shared UI
└── docs/                     # Documentation
```

---

## Performance Characteristics

Measured on Windows 11 (Intel i7, 16GB RAM):

- **Startup Time:** ~450ms
- **Memory (Idle):** ~87MB
- **Memory (Active):** ~143MB
- **App Size:** ~15MB

These metrics are typical for Tauri-based applications and represent significant improvements over Electron-based alternatives.

---

## Development

### Running Tests

```bash
# All tests
pnpm test

# Rust tests
cd apps/desktop/src-tauri && cargo test

# Frontend tests with UI
pnpm --filter @agiworkforce/desktop test:ui

# Coverage
pnpm --filter @agiworkforce/desktop test:coverage
```

### Linting and Type Checking

```bash
# Lint and typecheck
pnpm lint && pnpm typecheck

# Rust formatting
cd apps/desktop/src-tauri && cargo fmt && cargo clippy
```

### Common Commands

```bash
# Development server
pnpm --filter @agiworkforce/desktop dev

# Production build
pnpm --filter @agiworkforce/desktop build

# Run specific test file
pnpm test -- unifiedChatStore.test.ts
```

---

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Development guide and architecture
- **[docs/developer/CONTRIBUTING.md](docs/developer/CONTRIBUTING.md)** - Contribution guidelines
- **[docs/developer/TESTING.md](docs/developer/TESTING.md)** - Testing guide
- **[docs/architecture/AGENTS.md](docs/architecture/AGENTS.md)** - Agent system architecture
- **[docs/architecture/MCP_IMPLEMENTATION.md](docs/architecture/MCP_IMPLEMENTATION.md)** - MCP integration details

---

## Current Status

### Implemented Features

- **Unified Chat Interface** - Claude Desktop-inspired UI with centered layout
- **Multi-Provider LLM Support** - 9+ providers with latest November 2025 models
- **19 Automation Tools** - File ops, UI automation, browser, DB, API, vision, code exec
- **Windows UI Automation** - Native Windows UI Automation integration
- **Browser Automation** - Playwright-based web automation
- **File System Operations** - Read, write, create, delete with safety checks
- **Database Connectivity** - PostgreSQL, MySQL, MongoDB, Redis, SQLite
- **Terminal Integration** - Full PTY terminal emulation with xterm.js
- **Agent Planning & Execution** - Multi-step task planning with dependency resolution
- **Real-time Streaming** - SSE streaming with "Thinking..." indicator
- **Tool Execution** - Automatic tool calling with visual feedback
- **Error Handling & Recovery** - Production-grade retry and recovery strategies
- **Settings Management** - Comprehensive settings with API key management
- **Credential Storage** - Windows Credential Manager (DPAPI) integration
- **MCP Integration** - 1000+ tools via Model Context Protocol
- **Hook System** - Custom scripts on 14 event types

### Known Limitations

- **Platform:** Windows is the primary supported platform (macOS/Linux support is experimental)
- **Browser Automation:** Requires Chrome or Edge browser
- **Learning System:** Knowledge base stores patterns but does not implement machine learning
- **Context Limits:** Subject to individual LLM provider token limits
- **Autonomy:** Requires user approval for potentially destructive operations

### In Development

- Enhanced multi-agent orchestration
- Additional automation tools
- Improved error recovery
- Cross-platform support
- Plugin system for community extensions

---

## Roadmap

### Near Term (Q1 2026)

- Stabilize core features based on user feedback
- Improve error handling and recovery
- Add more comprehensive tests
- Enhance documentation
- Cross-platform testing

### Medium Term (Q2-Q3 2026)

- Plugin/extension marketplace
- Advanced code analysis tools
- Git integration
- Docker/Kubernetes automation
- Team collaboration features

### Long Term (Q4 2026+)

- Mobile companion apps
- Enterprise features (SSO, RBAC)
- Custom model fine-tuning support
- Workflow template sharing

---

## Configuration

### LLM Provider Setup

You need at least one LLM provider configured:

**OpenAI:**

1. Get API key from https://platform.openai.com/api-keys
2. Settings → LLM Providers → OpenAI
3. Recommended: GPT-4o for general tasks

**Anthropic:**

1. Get API key from https://console.anthropic.com/
2. Settings → LLM Providers → Anthropic
3. Recommended: Claude Sonnet 4.5 (best for coding)

**Google:**

1. Get API key from https://makersuite.google.com/app/apikey
2. Settings → LLM Providers → Google
3. Recommended: Gemini 2.5 Pro

**Ollama (Free, Local):**

1. Install from https://ollama.com
2. Pull a model: `ollama pull llama3`
3. Start service: `ollama serve`
4. No API key required - runs locally

### Database Setup

SQLite database is automatically created at: `%APPDATA%/agiworkforce/agiworkforce.db`

Migrations run automatically on startup.

### MCP Server Configuration

To add MCP (Model Context Protocol) servers:

1. Settings → MCP Servers
2. Add server configuration
3. Enable the server
4. Tools become available automatically

---

## Contributing

We welcome contributions! Please see [docs/developer/CONTRIBUTING.md](docs/developer/CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run tests: `pnpm test`
5. Commit: `git commit -m "feat: description"`
6. Push: `git push origin feature/your-feature`
7. Create a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **Tauri Team** - Desktop framework
- **Rust Community** - Language and ecosystem
- **React Team** - UI library
- **Anthropic, OpenAI, Google** - LLM APIs
- **Ollama Team** - Local LLM support

---

## Contact & Support

- **GitHub Issues:** [Report bugs or request features](https://github.com/siddharthanagula3/agiworkforce-desktop-app/issues)
- **Discussions:** [Join the conversation](https://github.com/siddharthanagula3/agiworkforce-desktop-app/discussions)

---

## Disclaimer

This is beta software under active development. While we strive for stability and reliability, you may encounter bugs or unexpected behavior. Please report any issues you find.

The automation capabilities of this software can perform potentially destructive operations (file deletion, system commands, etc.). Always review and understand what the system is doing, especially when auto-approval is enabled. Use at your own risk.

---

_Built with Tauri, Rust, React, and TypeScript_
_© 2025 AGI Workforce. MIT License._
