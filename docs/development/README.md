# Development Documentation

Guides for developing and contributing to AGI Workforce.

## Quick Links

| Document                          | Description                   |
| --------------------------------- | ----------------------------- |
| [Setup](setup.md)                 | Development environment setup |
| [Testing](testing.md)             | Test strategy and commands    |
| [Debugging](debugging.md)         | Debugging techniques          |
| [Fixes Applied](fixes-applied.md) | Bug fixes and patches log     |

## Code Patterns

The `patterns/` subdirectory contains coding pattern guides:

| Document                                              | Description               |
| ----------------------------------------------------- | ------------------------- |
| [React Patterns](patterns/react-patterns.md)          | React component patterns  |
| [Zustand Patterns](patterns/zustand-patterns.md)      | State management patterns |
| [Type System](patterns/type-system.md)                | TypeScript patterns       |
| [Quick References](patterns/react-quick-reference.md) | Quick lookup guides       |

## Essential Commands

```bash
# Start development
pnpm dev:desktop     # Desktop app
pnpm dev:web         # Web app

# Code quality
pnpm lint            # Run linter
pnpm typecheck:all   # Type check

# Testing
pnpm test            # Run tests
pnpm test:e2e        # E2E tests
```

## See Also

- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Contribution guidelines
- [CLAUDE.md](../../CLAUDE.md) - Development reference
