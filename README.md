# AGI Workforce

[![Version](https://img.shields.io/badge/version-1.0.9-blue.svg)](https://github.com/siddhartha/agiworkforce)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange.svg)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2.9-yellow.svg)](https://tauri.app/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)

> **Your Personal AI Workforce** - A desktop app where non-technical users simply tell an AI what they want done in everyday language, and it autonomously completes the task. Everything is reversible with one click. Built single-handedly by **Siddhartha Nagula** over 6 months of dedicated development.

---

## What is AGI Workforce?

AGI Workforce is like having a super-smart assistant that lives on your computer. You talk to it in plain English, and it does things for you automatically.

**Example conversations:**

- "Find all the invoices in my email from last month and put them in a folder"
- "Schedule a meeting with John next Tuesday at 2pm"
- "Write a summary of this document"
- "Create a spreadsheet with my sales data"
- "Search the web for the best coffee shops near me"

AGI Workforce figures out the steps needed and does them without asking you for permission at every step. If it makes a mistake, you can say "undo that" and it reverses everything.

### What Makes It Different?

| Traditional Software                      | AGI Workforce                 |
| ----------------------------------------- | ----------------------------- |
| Click buttons, fill forms, navigate menus | Just describe what you want   |
| You do each step manually                 | AI does steps automatically   |
| Mistakes require manual fixing            | One-click undo for everything |
| Need to learn each app                    | Just talk naturally           |

### Why AGI Workforce?

- **All-in-One Solution**: Chat, research, code, automate - everything in one place
- **Multi-Provider Freedom**: Use OpenAI, Anthropic, Google, DeepSeek, xAI, or local models
- **True Automation**: AI that can actually do things - browse the web, run commands, manage files
- **Privacy-First**: Your data stays on your machine with local SQLite storage
- **Enterprise-Ready**: Built with security, audit logging, and team collaboration in mind
- **Native Performance**: Rust-powered backend delivers blazing-fast, memory-efficient operation

---

## How It Works (The Big Picture)

```
┌─────────────────────────────────────────────────────────────────┐
│                        YOUR DEVICES                              │
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Desktop    │     │     Web      │     │    Mobile    │    │
│  │     App      │◄───►│    App       │◄───►│    (Future)  │    │
│  │ [Full AI]    │     │ [Chat Only]  │     │ [Sync Only]  │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUD SERVICES                               │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   AI Models  │     │   Database   │     │   Payments   │    │
│  │ (Claude,GPT) │     │  (Supabase)  │     │   (Stripe)   │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight:** The desktop app does all the "smart" work. The web app is mainly for billing and accessing chat from browsers.

### The AI Reasoning Loop

When you ask AGI Workforce to do something:

```
    1. UNDERSTAND          2. PLAN              3. EXECUTE
    ┌─────────┐           ┌─────────┐          ┌─────────┐
    │ "What   │    ──►    │ Break   │    ──►   │ Do each │
    │ does    │           │ into    │          │ step    │
    │ user    │           │ steps"  │          │         │
    │ want?"  │           │         │          │         │
    └─────────┘           └─────────┘          └─────────┘
         ▲                                          │
         │         4. REFLECT                       │
         │         ┌─────────┐                      │
         └──────── │ "Did it │ ◄────────────────────┘
                   │ work?"  │
                   └─────────┘
```

---

## Core Capabilities

### 1. Intelligent Chat & Conversations

- **Multi-Provider Support**: Seamlessly switch between OpenAI (GPT-4o, GPT-5), Anthropic (Claude 4 Opus, Claude Sonnet), Google (Gemini 2.5), DeepSeek, xAI (Grok), and local models via Ollama
- **Streaming Responses**: Real-time token streaming for immediate feedback
- **Vision & Multimodal**: Upload images for analysis, screenshots for debugging, documents for processing
- **Conversation Memory**: Intelligent context management that remembers your conversation history
- **Cost Tracking**: Real-time cost calculation showing exactly what each conversation costs

### 2. Autonomous Task Execution

When you set AGI Workforce to "autonomous mode," it works independently:

1. You describe what you want
2. AI breaks it into steps
3. AI executes each step automatically
4. AI shows you the result
5. You can undo anything if needed

### 3. File & Document Management

AGI Workforce can work with files on your computer:

- **Read files** - Look at documents, spreadsheets, PDFs
- **Create files** - Make new documents, images, code files
- **Edit files** - Change existing files
- **Move/rename files** - Organize your folders
- **Delete files** - Remove unwanted items (with undo!)
- **Create Word/Excel/PDF** - Generate professional documents

### 4. Web Browsing & Automation

- **Semantic Navigation**: Describe what you want ("fill out the contact form")
- **Web Scraping**: Extract structured data from websites
- **Form Filling**: Automatically complete web forms
- **Screenshot Analysis**: Capture and analyze web page content

### 5. Email & Calendar Integration

- Read and summarize emails
- Draft and send replies
- Search your inbox
- Create calendar events
- Schedule meetings

### 6. Terminal & Shell Integration

- **Command Generation**: Describe what you want, get the right command
- **Output Analysis**: AI interprets outputs and suggests next steps
- **Script Generation**: Create shell scripts for complex operations
- **Safe Execution**: Preview commands before running them

### 7. Deep Research Mode

For complex research tasks:

1. Searches multiple sources (web, your files, emails)
2. Reads and analyzes the content
3. Creates a summary with sources cited
4. Presents findings in an easy-to-read format

### 8. Code Generation & Development

- **Code Generation**: Generate complete functions, classes, or modules
- **Multi-Language Support**: Python, TypeScript, JavaScript, Rust, Go, Java, C++, and more
- **Code Explanation**: Understand complex codebases
- **Bug Detection**: Identify potential bugs and security vulnerabilities
- **Test Generation**: Automatically generate tests

### 9. MCP (Model Context Protocol) Integration

Extend AI capabilities with 40+ external tools:

- Pre-configured servers for databases, APIs, file systems
- Tool Discovery: Automatic discovery of available capabilities
- Secure Credentials: Store API keys in your OS keyring

---

## Safety & Control

### The Undo System

**Everything AGI Workforce does can be reversed.**

- Creates a file → You can delete it
- Deletes a file → You can restore it
- Sends an email → Draft only unless you approve
- Changes a document → Revert to the previous version

Just say "undo" or click the undo button.

### Resource Limits

Built-in safeguards prevent runaway operations:

- **Time limit:** Tasks stop after 5 minutes
- **Step limit:** Maximum 1,000 steps per task
- **Memory limit:** Won't use more than 2GB RAM
- **Retry limit:** Gives up after 3 consecutive failures

### Folder Permissions

You control exactly which folders AGI Workforce can access. It cannot see anything outside those folders.

---

## Technology Stack

### Desktop Application (Tauri + Rust)

| Component     | Technology                                          |
| ------------- | --------------------------------------------------- |
| **Framework** | Tauri 2.9 - Native desktop with web technologies    |
| **Backend**   | Rust - Memory-safe, blazing-fast performance        |
| **Runtime**   | Tokio - Async runtime for concurrent operations     |
| **Database**  | SQLite with WAL mode - Fast, reliable local storage |
| **Security**  | OS Keyring integration, AES-GCM encryption          |

### Frontend (React 19)

| Component            | Technology                                 |
| -------------------- | ------------------------------------------ |
| **UI Framework**     | React 19 with latest features              |
| **Build Tool**       | Vite 7 with SWC - Lightning-fast HMR       |
| **State Management** | Zustand v5 - Lightweight, powerful state   |
| **Styling**          | Tailwind CSS v4 - Utility-first CSS        |
| **Components**       | Radix UI - Accessible component primitives |
| **Terminal**         | xterm.js v6 - Full terminal emulation      |
| **Code Editor**      | Monaco Editor - VS Code's editor           |
| **Workflows**        | @xyflow/react v12 - Visual node editor     |

### Web Platform (Next.js 16)

| Component          | Technology                      |
| ------------------ | ------------------------------- |
| **Framework**      | Next.js 16 with App Router      |
| **Database**       | Supabase PostgreSQL with RLS    |
| **Authentication** | Supabase Auth with JWT          |
| **Payments**       | Stripe with webhook idempotency |

### Supported AI Models

| Provider      | Models                                                      | Features                       |
| ------------- | ----------------------------------------------------------- | ------------------------------ |
| **OpenAI**    | GPT-4o, GPT-4o-mini, GPT-5, o1, o1-mini                     | Chat, Vision, Function calling |
| **Anthropic** | Claude Opus 4.5, Claude 4/3.5 Sonnet, Claude 3.5 Haiku      | Chat, Vision, Long context     |
| **Google**    | Gemini 2.5 Pro/Flash, Gemini 2.0                            | Chat, Vision, Grounding        |
| **DeepSeek**  | DeepSeek V3, DeepSeek Coder                                 | Chat, Code generation          |
| **xAI**       | Grok 2, Grok 2 Vision                                       | Chat, Vision, Real-time        |
| **Local**     | Llama 3.3, Mistral, CodeLlama, Phi-3, Qwen 2.5 (via Ollama) | Full privacy                   |

---

## Getting Started

### Prerequisites

- **Node.js**: 22.12.0 or higher
- **pnpm**: 9.15.0 or higher
- **Rust**: 1.75 or higher (for development only)
- **Git**: Latest version

### Quick Installation

1. **Clone the repository:**

```bash
git clone https://github.com/siddhartha/agiworkforce.git
cd agiworkforce
```

2. **Install dependencies:**

```bash
pnpm install
```

3. **Configure environment:**

```bash
cp apps/desktop/.env.example apps/desktop/.env.local
# Edit with your API keys (OpenAI, Anthropic, etc.)
```

4. **Start the application:**

```bash
pnpm dev:desktop
```

The desktop app will launch with hot-reload enabled.

### First Steps

1. **Add your API keys**: Go to Settings > API Keys and add your provider keys
2. **Start chatting**: Open a new chat and start conversing with AI
3. **Try automation**: Ask it to do something ("list files on my Desktop")
4. **Explore MCP**: Enable MCP servers to extend capabilities

---

## Project Structure

```
agiworkforce/
├── apps/
│   ├── desktop/                 # Tauri desktop application
│   │   ├── src/                 # React frontend
│   │   │   ├── components/      # UI components
│   │   │   ├── stores/          # Zustand state stores
│   │   │   ├── hooks/           # Custom React hooks
│   │   │   └── types/           # TypeScript types
│   │   ├── src-tauri/           # Rust backend
│   │   │   ├── src/
│   │   │   │   ├── sys/         # System commands & security
│   │   │   │   ├── core/        # Business logic (AGI, LLM, MCP)
│   │   │   │   ├── data/        # Data access layer
│   │   │   │   ├── automation/  # Browser & workflow automation
│   │   │   │   └── integrations/# Third-party API integrations
│   │   │   └── capabilities/    # Tauri permission configs
│   │   └── e2e/                 # Playwright E2E tests
│   ├── web/                     # Next.js 16 SaaS platform
│   │   ├── app/                 # React Server Components
│   │   ├── lib/                 # Business logic & services
│   │   └── supabase/            # Database migrations
│   └── extension/               # Browser extension
├── services/
│   ├── api-gateway/             # Express.js REST API (port 3000)
│   └── signaling-server/        # WebSocket sync (port 4000)
├── packages/
│   ├── types/                   # Shared TypeScript types
│   └── utils/                   # Shared utilities
└── docs/                        # Documentation
```

---

## Development

### Essential Commands

```bash
# Development
pnpm dev:desktop              # Start desktop app (hot-reload)
pnpm --filter web dev         # Start web app
pnpm --filter @agiworkforce/api-gateway dev      # Start API gateway
pnpm --filter @agiworkforce/signaling-server dev # Start WebSocket server

# Code Quality
pnpm lint                     # Lint all code
pnpm lint:fix                 # Fix lint issues
pnpm format                   # Format with Prettier
pnpm typecheck:all            # Type check everything

# Testing
pnpm test                     # Run all tests
pnpm --filter @agiworkforce/desktop test:e2e     # E2E tests

# Building
pnpm build:desktop            # Build desktop (DMG/EXE/AppImage)
pnpm build                    # Build all packages
```

---

## Documentation

- **[PLAIN_ENGLISH_OVERVIEW.md](docs/plain-english-overview.md)** - Complete user guide in plain language
- **[HOW_IT_WORKS.md](docs/how-it-works.md)** - Technical architecture explained simply
- **[ARCHITECTURE.md](docs/architecture/system-architecture.md)** - System architecture deep-dive
- **[CONTRIBUTING.md](docs/guides/contributing.md)** - Contribution guidelines
- **[CLAUDE.md](docs/guides/claude-guidelines.md)** - AI assistant development guide

---

## Version History

### v1.0.9 (Current)

- Implemented 17 missing tool handlers (file*list, memory*\_, browser\_\_, api_download)
- Complete tool feedback loop verification
- Chat-first autonomous architecture with undo system
- Latest 2026 model support (GPT-5.2, Gemini 3, Claude Opus 4.5)
- Major dependency updates (React 19.2.3, Vite 7.3.1, Tauri 2.9.6)

### v1.0.6

- Simplified chat-first architecture with undo system
- "Always use agent mode" setting for enhanced automation
- Intelligent model router with task classification

### v1.0.5

- Global deployment with signaling server on Fly.io
- Auto-updater support for desktop
- Enhanced MCP tool integration

See [CHANGELOG.md](docs/CHANGELOG.md) for full history.

---

## About the Developer

**AGI Workforce** was developed single-handedly by **Siddhartha Nagula** over **6 months** of dedicated work. This project represents a comprehensive vision for AI-powered productivity - combining the best AI models with powerful automation capabilities in a native desktop experience.

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](docs/guides/contributing.md) for guidelines.

### Quick Contribution Guide

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make changes with tests
4. Run quality checks: `pnpm typecheck:all && pnpm lint && pnpm test`
5. Commit with conventional format: `git commit -m "feat: add amazing feature"`
6. Push and open a pull request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

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

<div align="center">

**Built with dedication by Siddhartha Nagula**

[Website](https://agiworkforce.com) | [Documentation](https://docs.agiworkforce.com) | [GitHub](https://github.com/siddhartha/agiworkforce)

</div>
