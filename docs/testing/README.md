# Testing Documentation

Test documentation, reports, and strategies for AGI Workforce.

## Documents

| Document                                          | Description                 |
| ------------------------------------------------- | --------------------------- |
| [E2E Summary](e2e-summary.md)                     | End-to-end test overview    |
| [Edge Cases Report](edge-cases-report.md)         | Edge case coverage analysis |
| [Test Execution Report](test-execution-report.md) | Test execution results      |

## Test Commands

```bash
# Unit & Component Tests (Vitest)
pnpm test                              # Run all tests
pnpm --filter @agiworkforce/desktop test  # Desktop tests
pnpm --filter web test                 # Web tests

# E2E Tests (Playwright)
pnpm --filter @agiworkforce/desktop test:e2e  # All E2E
pnpm --filter @agiworkforce/desktop test:e2e -- --project=smoke

# Coverage
pnpm --filter @agiworkforce/desktop test:coverage
```

## Test Strategy

- **Unit Tests**: Vitest with jsdom environment
- **Component Tests**: React Testing Library
- **E2E Tests**: Playwright with Chromium
- **Rust Tests**: `cargo test` in src-tauri

## See Also

- [Development Testing Guide](../development/testing.md)
- [CLAUDE.md Testing Section](../../CLAUDE.md)
