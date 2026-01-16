# AGI Workforce

[![Version](https://img.shields.io/badge/version-1.0.5-blue.svg)](https://github.com/siddhartha/agiworkforce)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange.svg)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2.9-yellow.svg)](https://tauri.app/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)

> **Your Personal AI Workforce** - An enterprise-grade AI automation platform that brings autonomous agents, intelligent chat, deep research, code generation, and powerful automation to your desktop. Built single-handedly by **Siddhartha Nagula** over 6 months of dedicated development.

---

## What is AGI Workforce?

**AGI Workforce** is a comprehensive AI-powered desktop application that acts as your personal team of AI assistants. Whether you need to have intelligent conversations, get expert advice, conduct deep research, write code, or automate complex workflows - AGI Workforce does it all from a single, beautifully designed interface.

Think of it as having access to the world's most capable AI models (OpenAI, Anthropic Claude, Google Gemini, DeepSeek, xAI Grok, and local models via Ollama) combined with powerful automation tools that can control your browser, execute terminal commands, manage files, and orchestrate complex multi-step tasks - all without leaving the application.

### Why AGI Workforce?

- **All-in-One Solution**: Chat, research, code, automate - everything in one place
- **Multi-Provider Freedom**: Use OpenAI, Anthropic, Google, DeepSeek, xAI, or local models
- **True Automation**: AI that can actually do things - browse the web, run commands, manage files
- **Privacy-First**: Your data stays on your machine with local SQLite storage
- **Enterprise-Ready**: Built with security, audit logging, and team collaboration in mind
- **Native Performance**: Rust-powered backend delivers blazing-fast, memory-efficient operation

---

## Core Capabilities

### 1. Intelligent Chat & Conversations

AGI Workforce provides a powerful chat interface that goes beyond simple Q&A:

- **Multi-Provider Support**: Seamlessly switch between OpenAI (GPT-4o, GPT-4), Anthropic (Claude 4 Opus, Claude Sonnet), Google (Gemini 2.5), DeepSeek, xAI (Grok), and local models via Ollama
- **Streaming Responses**: Real-time token streaming for immediate feedback
- **Vision & Multimodal**: Upload images for analysis, screenshots for debugging, documents for processing
- **Conversation Memory**: Intelligent context management that remembers your conversation history
- **Cost Tracking**: Real-time cost calculation showing exactly what each conversation costs
- **Multiple Chat Sessions**: Organize conversations by project or topic

### 2. Expert Advice & Assistance

Get thoughtful, expert-level guidance on any topic:

- **Domain Expertise**: From software engineering to business strategy, get advice tailored to your needs
- **Code Review**: Paste code and get detailed feedback on quality, security, and best practices
- **Problem Solving**: Describe complex problems and receive structured solutions
- **Decision Support**: Get pros/cons analysis and recommendations for tough decisions
- **Learning Assistant**: Explanations calibrated to your expertise level

### 3. Powerful Search & Discovery

Find information quickly and comprehensively:

- **Web Search Integration**: AI-enhanced web search that understands context
- **Local File Search**: Intelligent search across your documents and codebase
- **Semantic Search**: Find relevant content even when keywords don't match exactly
- **Cross-Reference**: Combine information from multiple sources automatically

### 4. Deep Research & Analysis

Conduct thorough research that would take humans hours:

- **Multi-Source Research**: Automatically gather and synthesize information from multiple sources
- **Structured Reports**: Generate well-organized research reports with citations
- **Fact Verification**: Cross-check claims across multiple sources
- **Trend Analysis**: Identify patterns and trends in complex data
- **Competitive Intelligence**: Research competitors, markets, and technologies

### 5. Code Generation & Development

Your AI pair programmer that actually writes production code:

- **Code Generation**: Generate complete functions, classes, or entire modules from descriptions
- **Multi-Language Support**: Python, TypeScript, JavaScript, Rust, Go, Java, C++, and more
- **Code Explanation**: Understand complex codebases with detailed explanations
- **Refactoring**: Transform messy code into clean, maintainable solutions
- **Bug Detection**: Identify potential bugs and security vulnerabilities
- **Test Generation**: Automatically generate unit tests and integration tests
- **Documentation**: Generate comprehensive documentation from code

### 6. Workflow Automation

Automate repetitive tasks with intelligent workflows:

- **Visual Workflow Builder**: Drag-and-drop interface to create complex automation flows
- **Conditional Logic**: Build workflows with if/then branching based on conditions
- **Parallel Execution**: Run multiple tasks simultaneously for maximum efficiency
- **Error Handling**: Built-in retry logic and fallback mechanisms
- **Scheduling**: Set up recurring automated tasks
- **Notifications**: Get alerts when workflows complete or encounter issues

### 7. Browser Automation

AI that can browse the web for you:

- **Semantic Navigation**: Describe what you want to do in plain English ("fill out the contact form", "download the PDF")
- **Web Scraping**: Extract structured data from websites
- **Form Filling**: Automatically complete web forms
- **Screenshot Analysis**: Capture and analyze web page content
- **Multi-Tab Management**: Work across multiple browser tabs
- **Cookie & Session Handling**: Maintain authenticated sessions

### 8. Terminal & Shell Integration

Execute commands with AI understanding:

- **Command Generation**: Describe what you want to do, get the right command
- **Output Analysis**: AI interprets command outputs and suggests next steps
- **Script Generation**: Create shell scripts for complex operations
- **Safe Execution**: Preview commands before running them
- **History & Context**: AI remembers previous commands in context

### 9. File & Document Management

Intelligent file operations:

- **File Organization**: Automatically organize files based on content
- **Document Processing**: Extract text from PDFs, images, and documents
- **Content Transformation**: Convert between formats, summarize documents
- **Batch Operations**: Process multiple files with a single command
- **Version Tracking**: Keep track of document changes over time

### 10. MCP (Model Context Protocol) Integration

Extend AI capabilities with external tools:

- **40+ MCP Servers**: Pre-configured servers for databases, APIs, file systems, and more
- **Custom Servers**: Build and connect your own MCP servers
- **Tool Discovery**: Automatic discovery of available tools and capabilities
- **Secure Credentials**: Store API keys and tokens in your OS keyring
- **Session Management**: Persistent connections with automatic reconnection

---

## Technology Stack

AGI Workforce is built with cutting-edge technologies for maximum performance and reliability:

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
| **Diagrams**         | Mermaid v11 - Diagram generation           |

### Web Platform (Next.js 16)

| Component          | Technology                      |
| ------------------ | ------------------------------- |
| **Framework**      | Next.js 16 with App Router      |
| **Database**       | Supabase PostgreSQL with RLS    |
| **Authentication** | Supabase Auth with JWT          |
| **Payments**       | Stripe with webhook idempotency |
| **Rate Limiting**  | Upstash Redis                   |
| **Server State**   | React Query v5                  |

### AI & ML Infrastructure

| Component          | Technology                                       |
| ------------------ | ------------------------------------------------ |
| **LLM Providers**  | OpenAI, Anthropic, Google, DeepSeek, xAI, Ollama |
| **Token Counting** | cl100k_base, o200k_base tokenizers               |
| **Streaming**      | Server-Sent Events (SSE) parsing                 |
| **Vision**         | Multimodal image analysis                        |
| **OCR**            | Tesseract integration                            |

---

## Supported AI Models

AGI Workforce supports all major AI providers:

### Cloud Providers

| Provider      | Models                                               | Features                       |
| ------------- | ---------------------------------------------------- | ------------------------------ |
| **OpenAI**    | GPT-4o, GPT-4o-mini, GPT-4-turbo, o1, o1-mini        | Chat, Vision, Function calling |
| **Anthropic** | Claude 4 Opus, Claude 3.5/4 Sonnet, Claude 3.5 Haiku | Chat, Vision, Long context     |
| **Google**    | Gemini 2.5 Pro/Flash, Gemini 2.0                     | Chat, Vision, Grounding        |
| **DeepSeek**  | DeepSeek V3, DeepSeek Coder                          | Chat, Code generation          |
| **xAI**       | Grok 2, Grok 2 Vision                                | Chat, Vision, Real-time        |

### Local Models (via Ollama)

Run AI models locally for complete privacy:

- Llama 3.3 (70B, 8B)
- Mistral (7B, Nemo)
- CodeLlama
- Phi-3
- Qwen 2.5
- And many more...

---

## Key Features at a Glance

| Feature                  | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| **Autonomous AGI**       | Self-directed agents that plan and execute complex goals |
| **Multi-Provider Chat**  | Switch between AI providers seamlessly                   |
| **Vision & Multimodal**  | Analyze images, screenshots, and documents               |
| **Browser Automation**   | AI-controlled web navigation with CDP                    |
| **Terminal Integration** | Execute and analyze shell commands                       |
| **Visual Workflows**     | Drag-and-drop automation builder                         |
| **MCP Integration**      | 40+ tools via Model Context Protocol                     |
| **Code Generation**      | Write, review, and refactor code                         |
| **Deep Research**        | Multi-source research and analysis                       |
| **Real-Time Sync**       | WebSocket sync between devices                           |
| **Offline Support**      | Full functionality without internet                      |
| **Enterprise Security**  | Encryption, audit logging, RBAC                          |
| **Cost Tracking**        | Real-time usage and cost monitoring                      |

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
3. **Try automation**: Create a simple workflow to automate a task
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

### Code Quality Standards

- **Zero Errors**: All code must pass TypeScript strict mode
- **Zero Warnings**: ESLint with max 15 warnings in CI
- **Formatted**: Prettier with single quotes, semicolons
- **Tested**: Vitest unit tests + Playwright E2E tests
- **Documented**: JSDoc comments on public APIs

---

## Documentation

### User Guides

- **[Quick Start Guide](docs/QUICK_START.md)** - Get started in 5 minutes
- **[User Guide](docs/USER_GUIDE.md)** - Complete user manual
- **[Features Guide](docs/FEATURES.md)** - All features explained
- **[FAQ](docs/FAQ.md)** - Common questions answered
- **[Keyboard Shortcuts](docs/KEYBOARD_SHORTCUTS.md)** - Productivity shortcuts

### Developer Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture deep-dive
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contribution guidelines
- **[CLAUDE.md](CLAUDE.md)** - AI assistant development guide
- **[CHANGELOG.md](docs/CHANGELOG.md)** - Version history

---

## Security & Privacy

AGI Workforce is built with security as a core principle:

- **Local-First**: Your data stays on your machine in encrypted SQLite
- **OS Keyring**: API keys stored in native OS keychain (macOS Keychain, Windows Credential Manager)
- **AES-GCM Encryption**: Sensitive data encrypted at rest
- **No Telemetry**: No data collection or tracking
- **Audit Logging**: Full activity logging for compliance
- **Row Level Security**: Supabase RLS for web platform

---

## Version History

### v1.0.5 (Current)

- Global deployment with signaling server
- Auto-updater support for desktop
- Enhanced MCP tool integration
- Performance optimizations

### v1.0.4

- Multi-provider LLM routing
- Browser automation with CDP
- Visual workflow builder
- Enhanced terminal integration

See [CHANGELOG.md](docs/CHANGELOG.md) for full history.

---

## About the Developer

**AGI Workforce** was developed single-handedly by **Siddhartha Nagula** over **6 months** of dedicated work. This project represents a comprehensive vision for AI-powered productivity - combining the best AI models with powerful automation capabilities in a native desktop experience.

The entire application - from the Rust backend to the React frontend, from the AI integrations to the browser automation, from the database schema to the payment processing - was designed and implemented by a single developer with a passion for building tools that make people more productive.

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

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
