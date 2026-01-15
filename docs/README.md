# AGI Workforce Documentation

Welcome to the AGI Workforce documentation! This directory contains comprehensive guides, references, and resources for developers, contributors, and users.

## Documentation Index

### Getting Started

- **[Main README](../README.md)** - Project overview, features, installation, and quick start guide
- **[Quick Reference](QUICK_REFERENCE.md)** - Fast reference for common commands and tasks
- **[CHANGELOG](CHANGELOG.md)** - Version history and release notes

### Development

- **[CLAUDE.md](../CLAUDE.md)** - AI-assisted development guide for Claude Code
- **[CONTRIBUTING](../CONTRIBUTING.md)** - Contribution guidelines and workflow
- **[ARCHITECTURE](../ARCHITECTURE.md)** - Detailed system architecture and design patterns

### API Documentation

- **[API Reference](API.md)** - Complete API documentation for Tauri commands, REST endpoints, and WebSocket protocol

### Operations

- **[Deployment Guide](DEPLOYMENT.md)** - Comprehensive deployment instructions for all platforms
- **[Troubleshooting](TROUBLESHOOTING.md)** - Solutions for common issues and problems

### Reports and Analysis

- **[Security Audit Report](reports/SECURITY_AUDIT_REPORT.md)** - Security assessment and fixes
- **[Production Readiness](reports/PRODUCTION_READINESS_REPORT.md)** - Production readiness checklist
- **[Final Code Audit](reports/FINAL_CODE_AUDIT.md)** - Comprehensive code review
- **[Subscription Flow Analysis](reports/SUBSCRIPTION_FLOW_ANALYSIS.md)** - Stripe integration analysis

### Setup Guides

- **[Stripe Integration](setup/STRIPE_INTEGRATION_CHECKLIST.md)** - Stripe payment setup
- **[Local Webhook Setup](setup/LOCAL_WEBHOOK_SETUP.md)** - Testing webhooks locally
- **[Environment Fixes](setup/ENV_FIXES_SUMMARY.md)** - Environment configuration fixes

## Quick Links

### For New Developers

1. Start with [README.md](../README.md) for project overview
2. Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for setup
3. Reference [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for common tasks
4. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) if you encounter issues

### For Contributors

1. Read [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines
2. Review [ARCHITECTURE.md](../ARCHITECTURE.md) for system design
3. Check [API.md](API.md) for API patterns
4. Follow commit guidelines in CONTRIBUTING.md

### For Deployment

1. Review [DEPLOYMENT.md](DEPLOYMENT.md) for platform-specific instructions
2. Check [setup/](setup/) guides for configuration
3. Monitor using patterns in DEPLOYMENT.md
4. Reference [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for issues

## Documentation Structure

```
docs/
├── README.md                      # This file - documentation index
├── API.md                         # API reference documentation
├── CHANGELOG.md                   # Version history
├── DEPLOYMENT.md                  # Deployment guide
├── TROUBLESHOOTING.md             # Troubleshooting guide
├── QUICK_REFERENCE.md             # Quick reference guide
│
├── MCP_INTEGRATION.md             # MCP complete integration guide (root)
├── MCP_EXAMPLES.md                # MCP code examples
├── MCP_TROUBLESHOOTING.md         # MCP debugging guide
├── MCP_QUICK_REFERENCE.md         # MCP quick reference
├── MCP_SERVER_DEVELOPMENT.md      # MCP server development guide
│
├── reports/                       # Analysis and audit reports
│   ├── SECURITY_AUDIT_REPORT.md
│   ├── PRODUCTION_READINESS_REPORT.md
│   ├── FINAL_CODE_AUDIT.md
│   ├── SUBSCRIPTION_FLOW_ANALYSIS.md
│   ├── SUBSCRIPTION_E2E_TEST_REPORT.md
│   ├── VERCEL_ENV_VALIDATION_REPORT.md
│   └── AGI_WORKFORCE_VS_CLAUDE_COWORK_COMPARISON.md
│
├── setup/                         # Setup and configuration guides
│   ├── STRIPE_INTEGRATION_CHECKLIST.md
│   ├── LOCAL_WEBHOOK_SETUP.md
│   ├── ENV_FIXES_SUMMARY.md
│   ├── STRIPE_FIXES_SUMMARY.md
│   └── FIXTURES_CREATION_SUMMARY.md
│
└── summaries/                     # Development summaries
    ├── CREATED_FILES_SUMMARY.md
    └── AGI_REFACTOR_LOG.md
```

## Key Features Documentation

### AGI System

The AGI system is documented in:

- [ARCHITECTURE.md](../ARCHITECTURE.md#agi-system-design) - System architecture
- [API.md](API.md#agi-commands) - AGI commands
- [summaries/AGI_REFACTOR_LOG.md](summaries/AGI_REFACTOR_LOG.md) - Refactoring notes

**Key Capabilities:**

- Self-directed reasoning loops
- Process planning with DAG
- Tool execution and reflection
- Learning from outcomes
- Safety limits (timeouts, iteration caps)

### MCP Integration

Model Context Protocol integration documentation:

**Comprehensive Guides:**

- **[MCP_INTEGRATION.md](../MCP_INTEGRATION.md)** - Complete integration guide with architecture, setup, and API reference
- **[MCP_EXAMPLES.md](MCP_EXAMPLES.md)** - Practical code examples for common operations
- **[MCP_TROUBLESHOOTING.md](MCP_TROUBLESHOOTING.md)** - Debugging and troubleshooting guide
- **[MCP_QUICK_REFERENCE.md](MCP_QUICK_REFERENCE.md)** - Quick reference for commands and patterns
- **[MCP_SERVER_DEVELOPMENT.md](MCP_SERVER_DEVELOPMENT.md)** - Guide for creating custom MCP servers

**Architecture Documentation:**

- [ARCHITECTURE.md](../ARCHITECTURE.md#mcp-integration) - System architecture
- [API.md](API.md#mcp-commands) - MCP commands
- [CLAUDE.md](../CLAUDE.md#mcp-model-context-protocol-integration) - Development patterns

**Key Features:**

- Dual transport support (STDIO for local, HTTP/SSE for remote)
- Secure credential management with AES-256-GCM encryption
- OAuth integration with automatic token refresh
- Tool discovery and dynamic execution
- Real-time health monitoring
- Protocol compliance (JSON-RPC 2.0, MCP 2024-11-05)

**Quick Start:**

```typescript
// List available tools
const tools = await invoke('mcp_list_tools');

// Execute a tool
const result = await invoke('mcp_call_tool', {
  toolId: 'mcp:::github:::create_issue',
  arguments: { repo: 'owner/repo', title: 'Bug', body: 'Description' },
});
```

### Stripe Integration

Payment processing documentation:

- [setup/STRIPE_INTEGRATION_CHECKLIST.md](setup/STRIPE_INTEGRATION_CHECKLIST.md) - Setup guide
- [setup/LOCAL_WEBHOOK_SETUP.md](setup/LOCAL_WEBHOOK_SETUP.md) - Local testing
- [reports/SUBSCRIPTION_FLOW_ANALYSIS.md](reports/SUBSCRIPTION_FLOW_ANALYSIS.md) - Flow analysis

**Critical Patterns:**

- Customer-to-user mapping via `stripe_customer_id`
- Webhook idempotency with `processed_stripe_events`
- Price-to-tier mapping (no substring matching)
- Metadata passing for user context

### Database Architecture

Database documentation:

- [ARCHITECTURE.md](../ARCHITECTURE.md#data-flow-patterns) - Data flow
- [CLAUDE.md](../CLAUDE.md#database-schema) - Schema details
- [CLAUDE.md](../CLAUDE.md#sqlite-configuration-desktop) - SQLite optimization

**Features:**

- SQLite with WAL mode (desktop)
- PostgreSQL with RLS (web)
- Optimized pragmas and indexes
- Migration management

## Technology Stack

### Frontend

**Desktop:**

- React 19.2 with TypeScript 5.9
- Vite 7 with SWC
- Zustand v5 for state management
- Radix UI + Tailwind CSS v4
- Monaco Editor, xterm.js, @xyflow/react

**Web:**

- Next.js 16 with React 19
- React Query v5
- Tailwind CSS v4 (CSS-first)
- Supabase client

### Backend

**Desktop (Rust):**

- Tauri 2.9 framework
- Tokio async runtime
- SQLite with rusqlite
- System integrations (clipboard, keyboard, etc.)

**Services (Node.js):**

- Express.js for REST API
- WebSocket (ws) for signaling
- JWT authentication
- Supabase SDK

### Database

- **PostgreSQL** (Supabase) - Web app
- **SQLite** (local) - Desktop app
- **Redis** (Upstash) - Rate limiting and caching

### AI/ML

- Multi-provider LLM router (OpenAI, Anthropic, Google, DeepSeek, xAI, Ollama)
- Token counting (cl100k_base, o200k_base)
- Vision capabilities (image analysis)
- MCP tool integration

## Development Workflow

### 1. Local Development

```bash
# Clone repository
git clone https://github.com/siddhartha/agiworkforce.git

# Install dependencies
pnpm install

# Start desktop development
pnpm dev:desktop

# Start web development
cd apps/web && pnpm dev
```

### 2. Making Changes

```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes and test
pnpm typecheck:all
pnpm lint
pnpm test

# Commit with conventional commits
git commit -m "feat: add new feature"
```

### 3. Testing

```bash
# Unit tests
pnpm test

# E2E tests
pnpm --filter @agiworkforce/desktop test:e2e

# Coverage
pnpm --filter @agiworkforce/desktop test:coverage
```

### 4. Deployment

- **Desktop**: Build with `pnpm build:desktop`
- **Web**: Auto-deploy via Vercel on push to main
- **Services**: Deploy to Railway, Render, or AWS

## Support and Community

### Getting Help

- **Documentation**: Start here in the docs folder
- **GitHub Issues**: [Report bugs](https://github.com/siddhartha/agiworkforce/issues)
- **GitHub Discussions**: [Ask questions](https://github.com/siddhartha/agiworkforce/discussions)
- **Email**: support@agiworkforce.com

### Contributing

We welcome contributions! See:

- [CONTRIBUTING.md](../CONTRIBUTING.md) - Full contribution guide
- [GitHub Issues](https://github.com/siddhartha/agiworkforce/issues) - Find tasks
- [Code of Conduct](../CONTRIBUTING.md#code-of-conduct) - Community guidelines

### Reporting Security Issues

For security vulnerabilities:

- **Email**: security@agiworkforce.com
- **Do NOT** open public GitHub issues
- Allow 48 hours for response

## Recent Updates

### Version 1.0.4 (Latest)

**New Features:**

- MCP HTTP transport support
- AGI reflection system
- Enhanced security audit fixes
- Process reasoning with DAG
- Improved credential management

**Bug Fixes:**

- Auth token clearing on logout
- Async mutex in learning system
- Settings persistence to disk
- MCP tool ID format

**Performance:**

- SQLite WAL mode optimization
- AGI timeout handling
- Plan tier hierarchy fixes

See [CHANGELOG.md](CHANGELOG.md) for complete version history.

## External Resources

### Official Documentation

- [Tauri](https://tauri.app/v2/) - Desktop framework
- [Next.js](https://nextjs.org/docs) - Web framework
- [React](https://react.dev) - UI library
- [Rust](https://doc.rust-lang.org/book/) - Systems language
- [Supabase](https://supabase.com/docs) - Backend platform

### Community Resources

- [Tauri Discord](https://discord.com/invite/tauri)
- [Next.js Discord](https://nextjs.org/discord)
- [Rust Users Forum](https://users.rust-lang.org/)

### Learning Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [The Rust Book](https://doc.rust-lang.org/book/)
- [React Tutorial](https://react.dev/learn)
- [Next.js Learn](https://nextjs.org/learn)

## License

AGI Workforce is released under the MIT License. See [LICENSE](../LICENSE) for details.

## Credits

Built with amazing open-source technologies:

- Tauri, React, Next.js, Rust
- Supabase, Stripe, Vercel
- Zustand, Radix UI, Tailwind CSS
- And many more!

---

**Documentation Version**: 1.0.4
**Last Updated**: 2026-01-15
**Maintained by**: AGI Automation LLC

For the most up-to-date documentation, visit our [GitHub repository](https://github.com/siddhartha/agiworkforce).
