# Developer Documentation Index

Welcome to the AGI Workforce developer documentation! This index will help you find the right guide for your needs.

## Quick Start

New to the project? Start here:

1. **[DEV_SETUP.md](./DEV_SETUP.md)** - Complete setup guide from scratch
2. **[CLAUDE.md](./CLAUDE.md)** - Project architecture and overview
3. **[SCRIPTS_REFERENCE.md](./SCRIPTS_REFERENCE.md)** - All available pnpm commands

## Documentation Overview

### Setup and Configuration

| Guide                              | Purpose                              | When to Use                                          |
| ---------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| **[DEV_SETUP.md](./DEV_SETUP.md)** | Step-by-step environment setup       | First time setup, onboarding new developers          |
| **[CLAUDE.md](./CLAUDE.md)**       | Project architecture and conventions | Understanding project structure, technical decisions |

### Development Workflow

| Guide                                              | Purpose                              | When to Use                                  |
| -------------------------------------------------- | ------------------------------------ | -------------------------------------------- |
| **[SCRIPTS_REFERENCE.md](./SCRIPTS_REFERENCE.md)** | Complete pnpm scripts documentation  | Finding the right command to run             |
| **[MONOREPO_GUIDE.md](./MONOREPO_GUIDE.md)**       | Managing workspaces and packages     | Working with multiple packages, sharing code |
| **[GIT_WORKFLOW.md](./GIT_WORKFLOW.md)**           | Git branching and commit conventions | Creating branches, making commits, PRs       |

### Code Quality

| Guide                                    | Purpose                            | When to Use                                   |
| ---------------------------------------- | ---------------------------------- | --------------------------------------------- |
| **[CODE_QUALITY.md](./CODE_QUALITY.md)** | ESLint, Prettier, TypeScript setup | Configuring IDE, understanding linting rules  |
| **[TESTING.md](./TESTING.md)**           | Testing strategies and guides      | Writing tests, running tests, debugging tests |

### Debugging and Troubleshooting

| Guide                                          | Purpose                                 | When to Use                            |
| ---------------------------------------------- | --------------------------------------- | -------------------------------------- |
| **[DEBUGGING.md](./DEBUGGING.md)**             | Debugging techniques for all components | Investigating bugs, performance issues |
| **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** | Common issues and solutions             | Stuck on an error, environment issues  |

## Learning Paths

### For New Developers

**Day 1: Setup**

1. Read [DEV_SETUP.md](./DEV_SETUP.md)
2. Install prerequisites
3. Clone repository
4. Run `pnpm install`
5. Start desktop app: `pnpm dev:desktop`
6. Verify everything works

**Day 2: Understanding the Project**

1. Read [CLAUDE.md](./CLAUDE.md) - Architecture overview
2. Explore desktop app features
3. Browse codebase structure
4. Read [MONOREPO_GUIDE.md](./MONOREPO_GUIDE.md) - Workspace management

**Day 3: First Contribution**

1. Read [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) - Git conventions
2. Read [CODE_QUALITY.md](./CODE_QUALITY.md) - Code standards
3. Pick a "good first issue"
4. Create feature branch
5. Make changes
6. Run tests: `pnpm test`
7. Create pull request

**Week 1: Deepening Knowledge**

1. Read [TESTING.md](./TESTING.md) - Testing practices
2. Write tests for your code
3. Read [DEBUGGING.md](./DEBUGGING.md) - Debug techniques
4. Set up IDE integration
5. Review [SCRIPTS_REFERENCE.md](./SCRIPTS_REFERENCE.md) - Available commands

### For Experienced Developers

**Quick Start:**

1. [DEV_SETUP.md](./DEV_SETUP.md) - Setup (skip if familiar)
2. [CLAUDE.md](./CLAUDE.md) - Architecture (skim for key patterns)
3. [MONOREPO_GUIDE.md](./MONOREPO_GUIDE.md) - Workspace commands
4. Start coding

**As Needed:**

- [SCRIPTS_REFERENCE.md](./SCRIPTS_REFERENCE.md) - Command reference
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - If issues arise
- [DEBUGGING.md](./DEBUGGING.md) - When debugging

### For Desktop App Development

**Focus on:**

1. [DEV_SETUP.md](./DEV_SETUP.md) → Desktop App section
2. [CLAUDE.md](./CLAUDE.md) → Desktop App architecture
3. [DEBUGGING.md](./DEBUGGING.md) → Desktop App debugging
4. [TESTING.md](./TESTING.md) → Unit and E2E tests

**Key Commands:**

```bash
pnpm dev:desktop      # Start development
pnpm test             # Run unit tests
pnpm test:e2e         # Run E2E tests
pnpm typecheck        # Type check
```

### For Web App Development

**Focus on:**

1. [DEV_SETUP.md](./DEV_SETUP.md) → Web App section
2. [CLAUDE.md](./CLAUDE.md) → Web App architecture
3. [DEBUGGING.md](./DEBUGGING.md) → Next.js debugging
4. [TESTING.md](./TESTING.md) → API route tests

**Key Commands:**

```bash
cd apps/web && pnpm dev    # Start development
pnpm test                   # Run tests
pnpm typecheck             # Type check
```

### For Backend Services Development

**Focus on:**

1. [DEV_SETUP.md](./DEV_SETUP.md) → Services section
2. [CLAUDE.md](./CLAUDE.md) → Services architecture
3. [DEBUGGING.md](./DEBUGGING.md) → Backend debugging
4. [MONOREPO_GUIDE.md](./MONOREPO_GUIDE.md) → Workspace filtering

**Key Commands:**

```bash
# API Gateway
pnpm --filter @agiworkforce/api-gateway dev

# Signaling Server
pnpm --filter @agiworkforce/signaling-server dev
```

## Common Tasks

### Setup Tasks

| Task                            | Guide                          | Section   |
| ------------------------------- | ------------------------------ | --------- |
| Install dependencies            | [DEV_SETUP.md](./DEV_SETUP.md) | Step 3    |
| Configure environment variables | [DEV_SETUP.md](./DEV_SETUP.md) | Step 4    |
| Set up database                 | [DEV_SETUP.md](./DEV_SETUP.md) | Step 5    |
| Configure IDE                   | [DEV_SETUP.md](./DEV_SETUP.md) | IDE Setup |

### Development Tasks

| Task               | Guide                                          | Section             |
| ------------------ | ---------------------------------------------- | ------------------- |
| Start dev server   | [SCRIPTS_REFERENCE.md](./SCRIPTS_REFERENCE.md) | Development         |
| Add new feature    | [GIT_WORKFLOW.md](./GIT_WORKFLOW.md)           | Starting New Work   |
| Fix a bug          | [DEBUGGING.md](./DEBUGGING.md)                 | Component-specific  |
| Write tests        | [TESTING.md](./TESTING.md)                     | Writing Tests       |
| Add shared package | [MONOREPO_GUIDE.md](./MONOREPO_GUIDE.md)       | Adding New Packages |

### Code Quality Tasks

| Task                  | Guide                                | Section          |
| --------------------- | ------------------------------------ | ---------------- |
| Lint code             | [CODE_QUALITY.md](./CODE_QUALITY.md) | Running ESLint   |
| Format code           | [CODE_QUALITY.md](./CODE_QUALITY.md) | Running Prettier |
| Fix type errors       | [CODE_QUALITY.md](./CODE_QUALITY.md) | TypeScript       |
| Configure IDE linting | [CODE_QUALITY.md](./CODE_QUALITY.md) | IDE Integration  |

### Testing Tasks

| Task               | Guide                      | Section           |
| ------------------ | -------------------------- | ----------------- |
| Run all tests      | [TESTING.md](./TESTING.md) | Running Tests     |
| Run specific tests | [TESTING.md](./TESTING.md) | Desktop/Web Tests |
| Debug failing test | [TESTING.md](./TESTING.md) | Debugging Tests   |
| Check coverage     | [TESTING.md](./TESTING.md) | Test Coverage     |

### Git Tasks

| Task                    | Guide                                | Section           |
| ----------------------- | ------------------------------------ | ----------------- |
| Create feature branch   | [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) | Starting New Work |
| Commit changes          | [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) | Commit Guidelines |
| Sync with main          | [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) | Syncing with Main |
| Create pull request     | [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) | PR Process        |
| Resolve merge conflicts | [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) | Fixing Conflicts  |

## Troubleshooting Index

### Installation Issues

| Issue                    | Guide                                      | Section             |
| ------------------------ | ------------------------------------------ | ------------------- |
| pnpm install fails       | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Installation Issues |
| Wrong Node/pnpm version  | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Installation Issues |
| Peer dependency warnings | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Installation Issues |

### Development Issues

| Issue                  | Guide                                      | Section           |
| ---------------------- | ------------------------------------------ | ----------------- |
| Port already in use    | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Dev Server Issues |
| Hot reload not working | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Dev Server Issues |
| Module not found       | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Dev Server Issues |
| Build fails            | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Build Issues      |

### Database Issues

| Issue                      | Guide                                      | Section         |
| -------------------------- | ------------------------------------------ | --------------- |
| SQLite locked              | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Database Issues |
| Supabase connection failed | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Database Issues |
| Migration fails            | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Database Issues |

### Testing Issues

| Issue                          | Guide                                      | Section        |
| ------------------------------ | ------------------------------------------ | -------------- |
| Tests timeout                  | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Testing Issues |
| E2E tests fail                 | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Testing Issues |
| Tests pass locally, fail in CI | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Testing Issues |

### Git Issues

| Issue                      | Guide                                      | Section          |
| -------------------------- | ------------------------------------------ | ---------------- |
| Pre-commit hook fails      | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Git Hooks Issues |
| Commitlint rejects message | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Git Hooks Issues |
| Merge conflicts            | [GIT_WORKFLOW.md](./GIT_WORKFLOW.md)       | Fixing Conflicts |

## Command Quick Reference

### Most Used Commands

```bash
# Start development
pnpm dev:desktop                   # Desktop app
cd apps/web && pnpm dev           # Web app

# Testing
pnpm test                          # All tests
pnpm test:e2e                     # E2E tests

# Code quality
pnpm lint:fix                      # Fix linting
pnpm format                        # Format code
pnpm typecheck:all                # Type check

# Building
pnpm build                         # Build all
pnpm build:desktop                # Build desktop

# Cleanup
pnpm clean:build                   # Clean builds
```

For complete command reference, see [SCRIPTS_REFERENCE.md](./SCRIPTS_REFERENCE.md).

## Technology Stack Reference

### Frontend (Desktop)

- **React 19.2** - UI framework
- **TypeScript 5.9** - Type safety
- **Vite 7** - Build tool
- **Zustand 5** - State management
- **Tailwind CSS 4** - Styling
- **Radix UI** - Component library

### Frontend (Web)

- **Next.js 16** - Framework
- **React 19** - UI library
- **Tailwind CSS 4** - Styling
- **React Query 5** - Server state
- **Zod 4** - Validation

### Backend (Desktop)

- **Tauri 2.9** - Desktop framework
- **Rust** - Backend language
- **SQLite** - Local database
- **Tokio** - Async runtime

### Backend (Services)

- **Express 5** - REST API
- **WebSocket (ws)** - Real-time
- **Node.js 22** - Runtime
- **Supabase** - Database

### Development Tools

- **pnpm 9.15** - Package manager
- **ESLint 9** - Linting
- **Prettier 3** - Formatting
- **Vitest 4** - Unit testing
- **Playwright 1.57** - E2E testing
- **Husky 9** - Git hooks

## Getting Help

### Documentation

1. Check this index for relevant guide
2. Search within guides using Cmd/Ctrl+F
3. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
4. Review [CLAUDE.md](./CLAUDE.md) for architecture

### Code Issues

1. Check [DEBUGGING.md](./DEBUGGING.md)
2. Use Chrome DevTools / VS Code debugger
3. Add logging / breakpoints
4. Search existing GitHub issues

### Environment Issues

1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. Verify Node.js/pnpm versions
3. Clean and reinstall: `pnpm clean && pnpm install`
4. Check environment variables

### Community

- **GitHub Issues** - Bug reports and feature requests
- **Pull Requests** - Code contributions
- **Team Discord/Slack** - Quick questions

## Contributing

Ready to contribute?

1. Read [GIT_WORKFLOW.md](./GIT_WORKFLOW.md)
2. Pick an issue or create one
3. Create feature branch
4. Make changes following [CODE_QUALITY.md](./CODE_QUALITY.md)
5. Write tests per [TESTING.md](./TESTING.md)
6. Create pull request

## Keeping Documentation Updated

Found outdated information?

1. Create an issue or PR
2. Update the relevant guide
3. Follow documentation style
4. Run spell check
5. Submit changes

## Documentation Style Guide

### Formatting

- Use Markdown
- Use code blocks with language tags
- Use tables for comparisons
- Use lists for steps
- Use headings for structure

### Content

- Be concise and clear
- Include examples
- Provide context
- Link to related docs
- Keep up to date

### Code Examples

- Use real, working code
- Show both good and bad examples
- Include comments when needed
- Keep examples focused

## Version History

- **v1.0** (2026-01-15) - Initial comprehensive documentation
  - DEV_SETUP.md
  - SCRIPTS_REFERENCE.md
  - TESTING.md
  - DEBUGGING.md
  - TROUBLESHOOTING.md
  - MONOREPO_GUIDE.md
  - CODE_QUALITY.md
  - GIT_WORKFLOW.md
  - DEVELOPER_DOCS_INDEX.md

## Feedback

Have suggestions for improving documentation?

- Create GitHub issue with "docs" label
- Submit PR with improvements
- Discuss in team meetings

---

**Welcome to AGI Workforce development!** We're excited to have you on the team.
