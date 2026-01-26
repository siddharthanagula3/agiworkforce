# Testing Guide

Comprehensive testing strategy for AGI Workforce.

## Test Stack

| Type           | Tool       | Location                  |
| -------------- | ---------- | ------------------------- |
| Unit/Component | Vitest     | `**/__tests__/`           |
| E2E            | Playwright | `apps/desktop/e2e/`       |
| Rust           | Cargo      | `src-tauri/src/**/tests/` |

## Running Tests

### Unit Tests

```bash
# All unit tests
pnpm test

# Desktop app tests
pnpm --filter @agiworkforce/desktop test

# Web app tests
pnpm --filter web test

# Watch mode
cd apps/desktop && pnpm vitest

# Single file
cd apps/desktop && pnpm vitest run src/__tests__/path/to/test.test.ts
```

### E2E Tests

```bash
# Requires preview server running
cd apps/desktop && pnpm build && pnpm preview

# Run all E2E tests
pnpm --filter @agiworkforce/desktop test:e2e

# Specific project
pnpm --filter @agiworkforce/desktop test:e2e -- --project=smoke
pnpm --filter @agiworkforce/desktop test:e2e -- --project=chat
pnpm --filter @agiworkforce/desktop test:e2e -- --project=agi

# UI mode (debugging)
pnpm --filter @agiworkforce/desktop test:e2e -- --ui
```

### Rust Tests

```bash
cd apps/desktop/src-tauri

# All tests
cargo test

# Single test
cargo test test_name

# With output
cargo test -- --nocapture
```

### Coverage

```bash
# Desktop coverage
pnpm --filter @agiworkforce/desktop test:coverage

# Web coverage
pnpm --filter web test:coverage
```

## Test Configuration

### Vitest (`vitest.config.ts`)

```typescript
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,tsx}'],
  },
});
```

### Playwright (`playwright.config.ts`)

```typescript
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5175',
    viewport: { width: 1920, height: 1080 },
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
});
```

## Writing Tests

### Component Tests

```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Store Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useMyStore } from './myStore';

describe('useMyStore', () => {
  beforeEach(() => {
    useMyStore.getState().reset();
  });

  it('updates state', () => {
    useMyStore.getState().updateData('new value');
    expect(useMyStore.getState().data).toBe('new value');
  });
});
```

### E2E Tests

```typescript
import { test, expect } from '@playwright/test';

test('user can send message', async ({ page }) => {
  await page.goto('/');
  await page.fill('[data-testid="chat-input"]', 'Hello');
  await page.click('[data-testid="send-button"]');
  await expect(page.locator('[data-testid="message"]')).toBeVisible();
});
```

### Rust Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_function() {
        let result = my_function(42);
        assert_eq!(result, 84);
    }

    #[tokio::test]
    async fn test_async_function() {
        let result = async_function().await;
        assert!(result.is_ok());
    }
}
```

## E2E Test Files

| File                         | Purpose                   |
| ---------------------------- | ------------------------- |
| `smoke.spec.ts`              | Critical path smoke tests |
| `chat.spec.ts`               | Chat interface tests      |
| `agi.spec.ts`                | AGI system tests          |
| `automation.spec.ts`         | Workflow automation tests |
| `browser-automation.spec.ts` | Browser control tests     |
| `settings.spec.ts`           | Settings tests            |
| `visual-regression.spec.ts`  | Visual regression tests   |

## CI Integration

Tests run automatically on:

- Pull request creation
- Push to main branch

```yaml
# GitHub Actions example
- name: Run Tests
  run: |
    pnpm test
    pnpm --filter @agiworkforce/desktop test:e2e
```

## Best Practices

1. **Test behavior, not implementation**
2. **Use meaningful test names**
3. **Keep tests isolated**
4. **Mock external dependencies**
5. **Maintain test coverage above 80%**

## Next Steps

- [Debugging Guide](debugging.md)
- [Development Setup](setup.md)
