# AGI Workforce Documentation

Welcome to the AGI Workforce documentation. This guide covers everything you need to build, deploy, and contribute to the project.

## Quick Links

| Section                                           | Description                  |
| ------------------------------------------------- | ---------------------------- |
| [Quick Start](getting-started/quick-start.md)     | Get running in 5 minutes     |
| [Installation](getting-started/installation.md)   | Complete setup guide         |
| [Configuration](getting-started/configuration.md) | Environment and settings     |
| [Architecture](architecture/overview.md)          | System design and data flows |
| [Development](development/setup.md)               | Full dev environment setup   |
| [Features](features/README.md)                    | Feature documentation        |
| [API Reference](api/README.md)                    | API and command reference    |

## Documentation Structure

```
docs/
├── getting-started/          # New user guides
│   ├── quick-start.md        # 5-minute setup
│   ├── installation.md       # System requirements & setup
│   └── configuration.md      # Environment variables & settings
├── architecture/             # System design
│   ├── overview.md           # High-level architecture
│   ├── websocket-protocol.md # Real-time communication
│   └── database/             # Database schema & patterns
├── development/              # Developer guides
│   ├── setup.md              # Dev environment setup
│   ├── testing.md            # Test strategy & commands
│   ├── debugging.md          # Debugging techniques
│   ├── fixes-applied.md      # Bug fixes log
│   └── patterns/             # Code patterns
│       ├── react-patterns.md      # React component patterns
│       ├── zustand-patterns.md    # State management patterns
│       └── type-system.md         # TypeScript patterns
├── features/                 # Feature documentation
│   ├── README.md             # Feature overview
│   ├── chat.md               # Chat interface
│   ├── agent-mode.md         # AGI autonomous mode
│   ├── browser-automation.md # Browser control
│   ├── mcp.md                # MCP integration overview
│   ├── credit-system.md      # Credit & billing system
│   ├── stripe-integration.md # Stripe payments
│   ├── keyboard-shortcuts.md # Keyboard shortcuts
│   └── mcp/                  # MCP deep-dive
│       ├── mcp-integration.md     # Integration guide
│       ├── mcp-server-development.md # Server development
│       ├── mcp-examples.md        # Usage examples
│       ├── mcp-quick-reference.md # Quick reference
│       └── mcp-troubleshooting.md # Troubleshooting
├── api/                      # API reference
│   ├── README.md             # API overview
│   ├── openapi.yaml          # OpenAPI specification
│   ├── web-api.md            # Next.js API routes
│   ├── API_QUICKSTART.md     # Quick start guide
│   ├── API_ROUTES.md         # Route documentation
│   ├── API_VERSIONING.md     # Versioning strategy
│   ├── RATE_LIMITS.md        # Rate limiting docs
│   └── examples/             # API usage examples
├── testing/                  # Test documentation
│   ├── e2e-summary.md        # E2E test overview
│   ├── edge-cases-report.md  # Edge case coverage
│   └── test-execution-report.md # Test results
├── deployment/               # Deployment guides
│   ├── desktop-builds.md     # Platform installers
│   ├── web-deployment.md     # Vercel deployment
│   └── production-verification.md # Production checks
├── security/                 # Security documentation
│   └── (security monitoring docs)
├── accessibility/            # Accessibility guides
│   ├── README.md             # Overview
│   ├── ARIA_PATTERNS.md      # ARIA best practices
│   ├── COLOR_CONTRAST.md     # Color accessibility
│   ├── KEYBOARD_NAVIGATION.md # Keyboard support
│   ├── SCREEN_READER_GUIDE.md # Screen reader support
│   └── TESTING_CHECKLIST.md  # A11y testing
├── setup/                    # Setup & configuration
│   ├── LOCAL_WEBHOOK_SETUP.md # Local webhook testing
│   ├── STRIPE_INTEGRATION_CHECKLIST.md # Stripe setup
│   ├── STRIPE_FIXES_SUMMARY.md # Stripe fixes applied
│   ├── ENV_FIXES_SUMMARY.md  # Environment fixes
│   └── FIXTURES_CREATION_SUMMARY.md # Test fixtures
├── reports/                  # Analysis reports
│   ├── SECURITY_AUDIT_REPORT.md # Security audit
│   ├── FINAL_CODE_AUDIT.md   # Code quality audit
│   ├── PRODUCTION_READINESS_REPORT.md # Production readiness
│   ├── SUBSCRIPTION_FLOW_ANALYSIS.md # Subscription analysis
│   └── SUBSCRIPTION_E2E_TEST_REPORT.md # Subscription tests
├── summaries/                # Change summaries
│   ├── AGI_REFACTOR_LOG.md   # AGI refactoring history
│   └── CREATED_FILES_SUMMARY.md # New files created
├── archive/                  # Historical documentation
│   └── (archived docs - reference only)
└── CHANGELOG.md              # Version history
```

## Project Overview

AGI Workforce is a desktop-first AI assistant that enables non-technical users to accomplish complex tasks through natural language. The system combines:

- **Chat Interface**: Natural language interaction with AI models
- **Agent Mode**: Autonomous task completion with full reversibility
- **Browser Automation**: Web task automation via natural language
- **MCP Integration**: Extensible tool ecosystem (hidden from users)
- **Credit System**: Usage-based billing with subscription tiers

## Technology Stack

| Component         | Technology                             |
| ----------------- | -------------------------------------- |
| Desktop Backend   | Tauri 2.9, Rust, Tokio, SQLite         |
| Desktop Frontend  | React 19, Vite 7, Zustand, Tailwind v4 |
| Web Platform      | Next.js 16, Supabase, Stripe           |
| Browser Extension | Manifest V3, Native Messaging          |
| Backend Services  | Express.js, WebSocket                  |

## Desktop Component Organization

The desktop app uses feature-based component organization:

```
apps/desktop/src/components/
├── AGI/                  # AGI-related components
├── Auth/                 # Authentication UI
├── Browser/              # Browser automation
├── CustomInstructions/   # Custom instructions dialog
├── ErrorHandling/        # Error boundary & reporting
├── Onboarding/           # User onboarding flow
├── SimpleMode/           # Simple/Advanced mode toggle
├── Subscription/         # Subscription gate & dialogs
├── UnifiedAgenticChat/   # Main chat interface
└── ui/                   # Shared UI primitives
```

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/siddhartha/agiworkforce/issues)
- **Discussions**: [GitHub Discussions](https://github.com/siddhartha/agiworkforce/discussions)
- **Contributing**: See [CONTRIBUTING.md](../CONTRIBUTING.md)

## Documentation Conventions

- **Code blocks**: All commands are bash unless otherwise noted
- **File paths**: Relative to repository root
- **Platform notes**: macOS/Windows/Linux differences noted where applicable
- **Kebab-case**: All documentation files use lowercase-kebab-case naming

---

**Documentation Version**: 1.1.0
**Last Updated**: January 2026
