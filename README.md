# AGI Workforce

A powerful desktop application that combines AI chat, browser automation, terminal control, and workflow orchestration. Built with Tauri (Rust + React), AGI Workforce enables autonomous agents to interact with your desktop environment through a comprehensive tool ecosystem.

## 🚀 Features

### Core Capabilities

- **Unified Agentic Chat**: Real-time conversational interface with streaming responses, message history, and context management
- **Browser Automation**: Full browser control with tab management, navigation, element interaction, and screenshot capture
- **Terminal Workspace**: Multi-session terminal emulator with AI-powered command suggestions
- **Cloud Storage Integration**: Unified access to Google Drive, Dropbox, and OneDrive from within the workspace
- **File Operations**: Comprehensive file system access with watch capabilities and safe mode approval rails
- **Git Integration**: Built-in Git operations for repository management
- **MCP Support**: Model Context Protocol integration for connecting to various data sources (Supabase, GitHub, etc.)

### AI & Automation

- **Multi-LLM Support**: OpenAI, Anthropic (Claude), Google Gemini, and local Ollama
- **Autonomous Agent Orchestration**: Multi-step task planning and execution
- **Tool Approval System**: Granular safety controls for high-risk operations
- **Computer Vision**: OCR and screen processing for native app automation
- **Browser Control**: Automated web interactions and form filling

### Productivity Features

- **Workspace Management**: Code editor integration, file tree navigation, and project organization
- **Media Lab**: High-fidelity UI for managing agent-generated media and artifacts
- **Subscription Management**: Integrated billing with Stripe (Pro and Max tiers)
- **User Feedback**: Built-in feedback submission system
- **Settings & Configuration**: Comprehensive settings for LLM providers, MCP servers, and preferences

## 🛠 Tech Stack

### Frontend

- **React 19** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **Zustand** for state management
- **Framer Motion** for animations

### Backend

- **Tauri 2.x** (Rust backend, webview frontend)
- **Tokio** for async runtime
- **SQLite** for local data storage
- **Model Context Protocol (MCP)** for tool integration

### Infrastructure

- **Supabase** for authentication, database, and subscriptions
- **Stripe** for payment processing
- **Next.js** for marketing website

### Package Management

- **pnpm workspaces** for monorepo management

## 📋 Prerequisites

- **Node.js**: ≥20.11.0
- **pnpm**: ≥9.15.0
- **Rust**: 1.90.0 (pinned in `rust-toolchain.toml`)
- **Platform Dependencies**:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools (C++)
  - **Linux**: WebKit2GTK and build-essential

## 🚦 Getting Started

### Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/siddhartha/agiworkforce.git
   cd agiworkforce
   ```

2. **Install dependencies**:

   ```bash
   pnpm install
   ```

3. **Configure environment**:

   ```bash
   cp apps/desktop/.env.example apps/desktop/.env
   ```

   Edit `apps/desktop/.env` and add your API keys:
   - `VITE_OPENAI_API_KEY` (optional)
   - `VITE_ANTHROPIC_API_KEY` (optional)
   - `VITE_GOOGLE_API_KEY` (optional)
   - `VITE_ENABLE_OLLAMA` (optional, for local LLM)

4. **Configure MCP servers** (optional):

   ```bash
   cp apps/desktop/mcp-servers-config.example.json apps/desktop/mcp-servers-config.json
   ```

   Edit the file to configure your MCP server connections.

5. **Run in development mode**:
   ```bash
   pnpm dev:desktop
   ```

## 🏗 Development

### Available Commands

From the repository root:

```bash
# Development
pnpm dev:desktop              # Run desktop app in dev mode
pnpm build:desktop            # Build desktop app for production
pnpm build:all                # Build all packages except desktop

# Testing
pnpm test                     # Run all tests (Vitest + Cargo)
pnpm --filter @agiworkforce/desktop test      # Desktop unit tests
pnpm --filter @agiworkforce/desktop test:e2e  # E2E tests (Playwright)

# Code Quality
pnpm lint                     # Run ESLint
pnpm lint:fix                 # Fix ESLint issues
pnpm typecheck                # TypeScript type checking
pnpm format                   # Format code with Prettier
pnpm format:check             # Check code formatting
```

### Desktop App Commands

From `apps/desktop`:

```bash
pnpm dev          # Vite + Tauri dev server
pnpm build        # Production build
pnpm test         # Vitest unit tests
pnpm test:e2e     # Playwright E2E tests
pnpm typecheck    # TypeScript check
pnpm lint:fix     # Fix linting issues
```

### Web App Commands

From `apps/web`:

```bash
pnpm dev          # Next.js dev server (http://localhost:3000)
pnpm build        # Production build
pnpm start        # Start production server
```

## 📁 Project Structure

```
agiworkforce/
├── apps/
│   ├── desktop/              # Main Tauri desktop application
│   │   ├── src/              # React frontend
│   │   │   ├── components/   # UI components
│   │   │   ├── stores/        # Zustand state management
│   │   │   ├── services/      # Business logic
│   │   │   ├── api/           # API clients
│   │   │   └── ...
│   │   └── src-tauri/         # Rust backend
│   │       ├── src/           # Rust source code
│   │       └── Cargo.toml     # Rust dependencies
│   ├── web/                   # Marketing website (Next.js)
│   │   ├── app/               # Next.js app directory
│   │   └── services/          # Server-side services
│   └── extension/             # Browser extension (minimal)
├── packages/
│   ├── types/                  # Shared TypeScript types
│   └── utils/                 # Shared utility functions
├── services/
│   ├── api-gateway/           # Backend API service
│   └── signaling-server/      # WebSocket signaling server
└── dev-scripts/               # Development helper scripts
```

## 🔧 Configuration

### Environment Variables

Key environment variables for the desktop app:

- `VITE_OPENAI_API_KEY`: OpenAI API key
- `VITE_ANTHROPIC_API_KEY`: Anthropic API key
- `VITE_GOOGLE_API_KEY`: Google Gemini API key
- `VITE_ENABLE_OLLAMA`: Enable local Ollama support
- `VITE_ENABLE_TELEMETRY`: Enable telemetry (default: false)
- `VITE_SENTRY_DSN`: Sentry error tracking DSN

### MCP Server Configuration

Configure MCP servers in `apps/desktop/mcp-servers-config.json`:

```json
{
  "servers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-supabase"],
      "env": {
        "SUPABASE_URL": "your-url",
        "SUPABASE_KEY": "your-key"
      }
    }
  }
}
```

## 🧪 Testing

### Unit Tests

```bash
pnpm --filter @agiworkforce/desktop test
```

### E2E Tests

```bash
pnpm --filter @agiworkforce/desktop test:e2e
```

### Rust Tests

```bash
cd apps/desktop/src-tauri
cargo test
```

## 📦 Building

### Desktop App

```bash
pnpm build:desktop
```

Builds will be output to:

- **macOS**: `apps/desktop/src-tauri/target/release/bundle/macos/`
- **Windows**: `apps/desktop/src-tauri/target/release/bundle/msi/`
- **Linux**: `apps/desktop/src-tauri/target/release/bundle/appimage/`

### Web App

```bash
cd apps/web
pnpm build
```

## 🔐 Security

- **Safe Mode**: Tool approval system for high-risk operations
- **Path Validation**: All file operations validate paths to prevent directory traversal
- **RLS Policies**: Row-level security in Supabase for data access
- **Environment Variables**: Never commit API keys or secrets

## 📄 License

MIT License. See `LICENSE` for details.

## 🌐 Links

- **Website**: https://agiworkforce.com
- **Repository**: https://github.com/siddhartha/agiworkforce

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

## 📝 Notes

- Rust toolchain is pinned to 1.90.0 via `rust-toolchain.toml`
- The desktop app requires Tauri 2.x
- MCP servers must be configured separately
- Supabase and Stripe integrations require proper API keys and configuration
