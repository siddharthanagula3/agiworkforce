# Testing Guide

Comprehensive testing documentation for the AGI Workforce project covering unit testing, integration testing, E2E testing, test data management, CI/CD pipelines, and best practices.

## Table of Contents

- [Overview](#overview)
- [Testing Philosophy](#testing-philosophy)
- [Testing Stack](#testing-stack)
- [Unit Testing with Vitest](#unit-testing-with-vitest)
- [E2E Testing with Playwright](#e2e-testing-with-playwright)
- [Rust Testing](#rust-testing)
- [Test Data Management](#test-data-management)
- [CI/CD Testing Pipeline](#cicd-testing-pipeline)
- [Code Coverage](#code-coverage)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Quick Reference](#quick-reference)

## Overview

AGI Workforce uses a multi-layered testing approach:

- **Unit Tests**: Vitest for TypeScript/React components and services
- **Integration Tests**: Vitest + Rust tests for business logic and API integration
- **E2E Tests**: Playwright for full user workflow testing
- **Visual Regression**: Playwright screenshots for UI consistency

### Coverage Requirements

- **Minimum Coverage**: 70% overall
- **Target Coverage**: 80%+
- **Critical Paths**: 90%+ (authentication, payment, AGI core)
- **UI Components**: 60%+ (focus on logic over presentation)

### Testing Pyramid

```
        /\
       /  \      E2E Tests (Playwright)
      /----\     ~100 tests, slow, comprehensive
     /      \
    /--------\   Integration Tests (Vitest + Rust)
   /          \  ~300 tests, medium speed, API/DB
  /------------\
 /   Unit Tests \ Vitest + Rust
/________________\ ~1000 tests, fast, isolated
```

## Testing Philosophy

Our testing strategy follows these principles:

1. **Fast Feedback**: Unit tests run in <5s, full suite in <2min
2. **Test Behavior, Not Implementation**: Focus on what the code does, not how
3. **Isolation**: Tests should not depend on each other or external state
4. **Realistic**: Use production-like data and scenarios
5. **Maintainability**: Tests should be easy to understand and update
6. **Confidence**: Tests should catch real bugs, not just increase coverage

### When to Test

- **Always Test**: Business logic, API endpoints, critical user paths
- **Consider Testing**: Complex UI logic, error handling, edge cases
- **Don't Test**: Third-party libraries, trivial getters/setters, constants

### Test Naming Convention

```typescript
// Pattern: should_[expected behavior]_when_[condition]
it('should return 401 when user is not authenticated', async () => {
  // Arrange
  const request = createUnauthenticatedRequest();

  // Act
  const response = await POST(request);

  // Assert
  expect(response.status).toBe(401);
});
```

## Testing Stack

### Web App (Next.js)

- **Test Runner**: Vitest 2.x
- **DOM Testing**: jsdom environment
- **Component Testing**: React Testing Library
- **Assertions**: Vitest expect + @testing-library/jest-dom
- **Mocking**: Vitest vi
- **Coverage**: V8 coverage provider

### Desktop App (Tauri)

- **Frontend Tests**: Vitest (same as web)
- **E2E Tests**: Playwright
- **Backend Tests**: Rust built-in test framework
- **Integration Tests**: Tokio test runtime

### Services

- **API Gateway**: Vitest with Supertest
- **Signaling Server**: Vitest with WebSocket mocking

## Unit Testing with Vitest

### Setup and Configuration

**Configuration File**: `apps/web/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['**/__tests__/**/*.{test,spec}.{ts,tsx}', '!e2e/**'],
    exclude: ['node_modules/', '.next/', 'e2e/', 'dist/'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'e2e/',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/__tests__/**',
        'next.config.ts',
        'tailwind.config.*',
        'postcss.config.*',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

**Setup File**: `apps/web/test/setup.ts`

```typescript
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

// Mock Next.js headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => ({ value: 'test-cookie' })),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

// Mock server-only module
vi.mock('server-only', () => ({}));
```

### Running Tests

```bash
# Run all unit tests
pnpm test

# Run tests in a specific workspace
pnpm --filter @agiworkforce/web test
pnpm --filter @agiworkforce/desktop test

# Run specific test file
cd apps/web && pnpm vitest run __tests__/api/checkout.test.ts

# Watch mode for development
cd apps/web && pnpm vitest watch

# Run with coverage
pnpm --filter web test:coverage

# Run tests with UI (interactive debugging)
cd apps/web && pnpm vitest --ui
```

### API Route Testing Pattern

**Example**: Testing a Next.js API route with authentication and validation

```typescript
// apps/web/__tests__/api/checkout.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/checkout/route';

// Mock dependencies
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../services/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
          },
        },
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => ({
            data: { stripe_customer_id: 'cus_test123' },
          })),
        })),
      })),
    })),
  })),
}));

describe('POST /api/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_key';
  });

  it('should return 401 when user is not authenticated', async () => {
    const { createSupabaseServerClient } = await import('../../services/supabase-server');
    vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: null },
        })),
      },
    } as any);

    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('should validate request body schema', async () => {
    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'invalid', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('should create checkout session for valid request', async () => {
    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBeDefined();
  });
});
```

### Service Layer Testing Pattern

**Example**: Testing business logic with database operations

```typescript
// apps/web/__tests__/services/credit-service.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Supabase
const mockRpc = vi.fn();
const mockSupabaseClient = {
  rpc: mockRpc,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

import { CreditService } from '@/lib/services/credit-service';

describe('CreditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDailyLimit', () => {
    it('should calculate 30% of monthly credits as daily limit', () => {
      expect(CreditService.getDailyLimit(10000)).toBe(3000);
      expect(CreditService.getDailyLimit(5000)).toBe(1500);
    });

    it('should handle large credit amounts', () => {
      expect(CreditService.getDailyLimit(1000000)).toBe(300000);
    });
  });

  describe('getBalance', () => {
    it('should return credit balance for user', async () => {
      const mockBalance = {
        account_id: 'acc_123',
        period_start: '2025-01-01T00:00:00Z',
        period_end: '2025-02-01T00:00:00Z',
        credits_allocated_cents: 5000,
        credits_used_cents: 1000,
        credits_remaining_cents: 4000,
        percentage_used: 20,
        daily_limit_cents: 1500,
        daily_used_cents: 500,
        daily_remaining_cents: 1000,
        last_daily_reset_at: '2025-01-02T00:00:00Z',
      };

      mockRpc.mockResolvedValue({ data: [mockBalance], error: null });

      const result = await CreditService.getBalance('user-123');

      expect(mockRpc).toHaveBeenCalledWith('get_credit_balance', {
        p_user_id: 'user-123',
      });
      expect(result).toEqual(mockBalance);
    });

    it('should throw error if database call fails', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      });

      await expect(CreditService.getBalance('user-123')).rejects.toThrow();
    });
  });

  describe('deductCredits', () => {
    it('should deduct credits successfully', async () => {
      const mockResult = {
        success: true,
        account_id: 'acc_123',
        remaining_cents: 4900,
      };

      mockRpc.mockResolvedValue({ data: mockResult, error: null });

      const result = await CreditService.deductCredits(
        'user-123',
        100,
        'API call: claude-sonnet-4-5',
        { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      );

      expect(mockRpc).toHaveBeenCalledWith('deduct_credits', {
        p_user_id: 'user-123',
        p_amount_cents: 100,
        p_description: 'API call: claude-sonnet-4-5',
        p_metadata: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
        p_idempotency_key: null,
      });
      expect(result).toEqual(mockResult);
    });

    it('should return error when daily limit reached', async () => {
      const mockResult = {
        success: false,
        code: 'DAILY_CREDIT_LIMIT_REACHED',
        daily_limit: 1500,
        daily_remaining: 50,
      };

      mockRpc.mockResolvedValue({ data: mockResult, error: null });

      const result = await CreditService.deductCredits('user-123', 100);

      expect(result.success).toBe(false);
      expect(result.code).toBe('DAILY_CREDIT_LIMIT_REACHED');
    });
  });
});
```

### React Component Testing Pattern

**Example**: Testing a form component with user interactions

```typescript
// apps/desktop/src/components/__tests__/Button.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button';

describe('Button', () => {
  it('should render with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('should call onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Button disabled>Click me</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should apply variant styles', () => {
    render(<Button variant="primary">Click me</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-primary');
  });
});
```

### Zustand Store Testing Pattern

```typescript
// apps/desktop/src/stores/__tests__/chatStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../chatStore';

describe('chatStore', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('should initialize with empty messages', () => {
    const state = useChatStore.getState();
    expect(state.messages).toEqual([]);
  });

  it('should add a message', () => {
    const store = useChatStore.getState();

    store.addMessage({
      id: '1',
      role: 'user',
      content: 'Hello',
      timestamp: Date.now(),
    });

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({
      role: 'user',
      content: 'Hello',
    });
  });
});
```

### Mocking Best Practices

**Module Mocking**

```typescript
// Mock entire module
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock specific function
vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual('@/lib/utils');
  return {
    ...actual,
    formatCurrency: vi.fn((cents) => `$${(cents / 100).toFixed(2)}`),
  };
});
```

**Spy on Functions**

```typescript
import * as utils from '@/lib/utils';

it('should call formatCurrency', () => {
  const spy = vi.spyOn(utils, 'formatCurrency');
  const result = utils.formatCurrency(1000);
  expect(spy).toHaveBeenCalledWith(1000);
  spy.mockRestore();
});
```

**Mock Timers**

```typescript
it('should retry after delay', async () => {
  vi.useFakeTimers();
  const callback = vi.fn();
  retryWithDelay(callback, 1000);
  expect(callback).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  expect(callback).toHaveBeenCalled();
  vi.useRealTimers();
});
```

## E2E Testing with Playwright

### Configuration

**Playwright Config**: `apps/desktop/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
    ['junit', { outputFile: 'playwright-report/junit.xml' }],
    process.env['CI'] ? ['github'] : ['list'],
  ],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    baseURL: 'http://localhost:5175',
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'smoke',
      testMatch: '**/smoke.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chat',
      testMatch: '**/chat.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'automation',
      testMatch: '**/automation.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  globalTimeout: process.env['CI'] ? 1800000 : 3600000,

  expect: {
    timeout: 5000,
  },
});
```

### Running E2E Tests

```bash
# Run all E2E tests
pnpm --filter @agiworkforce/desktop test:e2e

# Run specific project
pnpm --filter @agiworkforce/desktop test:e2e -- --project=smoke
pnpm --filter @agiworkforce/desktop test:e2e -- --project=chat

# Run with UI mode (interactive debugging)
pnpm --filter @agiworkforce/desktop test:e2e -- --ui

# Debug mode (headed browser)
pnpm --filter @agiworkforce/desktop test:e2e -- --headed --debug

# Generate trace
pnpm --filter @agiworkforce/desktop test:e2e -- --trace on
```

### Smoke Test Pattern

**Example**: Basic app functionality verification

```typescript
// apps/desktop/e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Desktop App Smoke Tests', () => {
  test('app launches and main window renders', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);

    const root = page.locator('#root');
    await expect(root).toBeAttached({ timeout: 10000 });

    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const html = await page.content();
    expect(html).toContain('<div id="root"');
  });
});
```

### User Workflow Testing Pattern

**Example**: Complete chat interaction flow

```typescript
// apps/desktop/e2e/chat.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Chat Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should send message and receive response', async ({ page }) => {
    test.setTimeout(60000);

    const chatInput = page.locator('[data-testid="chat-input"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    const testQuery = 'What is the capital of France?';
    await chatInput.fill(testQuery);

    const sendButton = page.locator('[data-testid="send-message"]').first();
    await sendButton.click();

    const userMessage = page.locator('[data-role="user"]').last();
    await expect(userMessage).toContainText(testQuery, { timeout: 10000 });

    const assistantMessage = page.locator('[data-role="assistant"]').last();
    await expect(assistantMessage).toBeVisible({ timeout: 30000 });

    const responseText = await assistantMessage.textContent();
    expect(responseText?.trim().length).toBeGreaterThan(0);
  });

  test('should handle offline state gracefully', async ({ page, context }) => {
    await context.setOffline(true);

    const chatInput = page.locator('[data-testid="chat-input"]').first();
    if (await chatInput.isVisible()) {
      await chatInput.fill('This should fail');
      await page.locator('[data-testid="send-message"]').first().click();
      await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10000 });
    }

    await context.setOffline(false);
  });
});
```

### Page Object Model Pattern

**Example**: Reusable page objects

```typescript
// pages/ChatPage.ts
import { Page, Locator } from '@playwright/test';

export class ChatPage {
  readonly page: Page;
  readonly chatInput: Locator;
  readonly sendButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.chatInput = page.locator('[data-testid="chat-input"]');
    this.sendButton = page.locator('[data-testid="send-message"]');
  }

  async goto() {
    await this.page.goto('/chat');
    await this.page.waitForLoadState('networkidle');
  }

  async sendMessage(message: string) {
    await this.chatInput.fill(message);
    await this.sendButton.click();
  }

  async getLastUserMessage() {
    return this.page.locator('[data-role="user"]').last();
  }
}
```

## Rust Testing

### Unit Tests

**Location**: Inline with source code

```rust
// src/core/agi/core.rs

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agi_config_default() {
        let config = AGIConfig::default();
        assert_eq!(config.max_concurrent_tools, 10);
        assert_eq!(config.knowledge_memory_mb, 1024);
        assert!(config.enable_learning);
    }

    #[test]
    fn test_goal_serialization() {
        let goal = Goal {
            id: "test-goal".to_string(),
            description: "Test goal".to_string(),
            priority: Priority::High,
            deadline: None,
            constraints: vec![],
            success_criteria: vec!["Success".to_string()],
        };

        let serialized = serde_json::to_string(&goal).unwrap();
        let deserialized: Goal = serde_json::from_str(&serialized).unwrap();

        assert_eq!(goal.id, deserialized.id);
    }
}
```

### Async Tests with Tokio

```rust
#[cfg(test)]
mod tests {
    use tokio::time::{sleep, Duration};

    #[tokio::test]
    async fn test_async_operation() {
        let result = some_async_function().await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_timeout_handling() {
        let timeout = Duration::from_secs(5);
        let result = tokio::time::timeout(
            timeout,
            some_long_running_operation()
        ).await;
        assert!(result.is_ok());
    }
}
```

### Running Rust Tests

```bash
# Run all Rust tests
cargo test

# Run with output
cargo test --workspace -- --nocapture

# Run specific test
cargo test test_agi_config_default

# Run with specific feature
cargo test --features "vision"

# Run with all features
cargo test --all-features

# Run only unit tests
cargo test --lib

# Run only integration tests
cargo test --test integration_tests
```

## Test Data Management

### Test Data Factories

**TypeScript Factory Pattern**

```typescript
// test/factories/user.factory.ts
import { faker } from '@faker-js/faker';

export const createTestUser = (overrides = {}) => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  name: faker.person.fullName(),
  created_at: faker.date.past().toISOString(),
  ...overrides,
});

export const createTestSubscription = (overrides = {}) => ({
  id: faker.string.uuid(),
  user_id: faker.string.uuid(),
  plan: 'pro',
  status: 'active',
  ...overrides,
});

// Usage
const user = createTestUser({ email: 'test@example.com' });
const subscription = createTestSubscription({ user_id: user.id });
```

### Database Seeding for Tests

```typescript
// test/helpers/db-seed.ts
import { createClient } from '@supabase/supabase-js';

export async function seedTestDatabase() {
  const supabase = createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: users } = await supabase
    .from('profiles')
    .insert([
      {
        id: 'test-user-1',
        email: 'test1@example.com',
        name: 'Test User 1',
      },
    ])
    .select();

  return { users };
}

export async function cleanTestDatabase() {
  const supabase = createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
  );

  await supabase.from('subscriptions').delete().neq('id', '');
  await supabase.from('profiles').delete().neq('id', '');
}
```

### Test Fixtures

```typescript
// test/fixtures/api-responses.ts
export const mockStripeCheckoutSession = {
  id: 'cs_test_123',
  object: 'checkout.session',
  amount_total: 2000,
  currency: 'usd',
  customer: 'cus_test_123',
  payment_status: 'paid',
  status: 'complete',
  url: 'https://checkout.stripe.com/test',
};

// Usage
import { mockStripeCheckoutSession } from '@/test/fixtures/api-responses';

it('should process webhook event', async () => {
  const result = await processWebhook(mockStripeCheckoutSession);
  expect(result.success).toBe(true);
});
```

## CI/CD Testing Pipeline

### GitHub Actions Workflow

**Main CI Workflow**: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Lint
        run: pnpm lint

      - name: Test (TypeScript)
        run: pnpm test

      - name: Build web app
        run: pnpm --filter web build

      - name: Test (Rust)
        run: cargo test --workspace

      - name: Clippy
        run: cargo clippy --workspace --all-targets -- -D warnings
```

**E2E Tests Workflow**: `.github/workflows/e2e-tests.yml`

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  schedule:
    - cron: '0 2 * * *'

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps
        working-directory: apps/desktop

      - name: Run E2E tests
        run: |
          pnpm exec playwright test --project=smoke \
            --reporter=html,json \
            --retries=2
        working-directory: apps/desktop

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: apps/desktop/test-results/
```

## Code Coverage

### Coverage Goals by Layer

| Layer      | Target | Critical Path |
| ---------- | ------ | ------------- |
| API Routes | 80%    | 90%           |
| Services   | 85%    | 95%           |
| Utils      | 90%    | 100%          |
| Components | 60%    | 75%           |
| E2E Flows  | 70%    | 90%           |

### Viewing Coverage Reports

```bash
# Generate and open HTML report
pnpm --filter web test:coverage
open apps/web/coverage/index.html

# Terminal summary
pnpm --filter web test:coverage -- --reporter=text

# CI-friendly JSON output
pnpm --filter web test:coverage -- --reporter=json
```

## Best Practices

### General Testing Principles

1. **AAA Pattern**: Arrange, Act, Assert
2. **Single Responsibility**: Each test verifies one thing
3. **Test Independence**: Tests don't depend on execution order
4. **Descriptive Names**: Test names describe the scenario

### Mocking Best Practices

1. **Mock External Dependencies**: APIs, databases, file system
2. **Don't Mock Everything**: Test real logic, mock boundaries
3. **Use Test Doubles Appropriately**: Stubs, mocks, spies, fakes

### Performance Optimization

1. **Parallel Execution**: Run independent tests concurrently
2. **Lazy Loading**: Import modules only when needed
3. **Reuse Setup**: Use beforeAll for expensive setup

### Flaky Test Prevention

1. **Avoid Timing Dependencies**: Use waitFor instead of setTimeout
2. **Deterministic Data**: Use fixed seeds for random data
3. **Clean State**: Reset state between tests
4. **Stable Selectors**: Use data-testid over CSS classes

## Troubleshooting

### Common Issues and Solutions

#### 1. Tests Timing Out

```typescript
// Increase timeout for specific test
test('long running test', async () => {
  test.setTimeout(60000); // 60 seconds
});
```

#### 2. Flaky E2E Tests

```typescript
// Use proper waits
await page.waitForSelector('[data-testid="element"]');
await page.waitForLoadState('networkidle');
```

#### 3. Mock Not Working

```typescript
// Ensure mock is called before import
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}));

const { api } = await import('@/lib/api');
```

### Debugging Tests

**Vitest Debugging**:

```bash
# Run with debug output
node --inspect-brk ./node_modules/vitest/vitest.mjs run test-file.test.ts
```

**Playwright Debugging**:

```bash
# Run with UI mode
pnpm test:e2e -- --ui

# Run with headed browser
pnpm test:e2e -- --headed --debug

# Generate trace
pnpm test:e2e -- --trace on
```

## Quick Reference

```bash
# Run all tests
pnpm test

# Desktop unit tests
pnpm --filter @agiworkforce/desktop test

# Desktop E2E tests
pnpm --filter @agiworkforce/desktop test:e2e

# Web unit tests
pnpm --filter @agiworkforce/web test

# Watch mode
pnpm test -- --watch

# UI mode
pnpm test:ui

# Coverage
pnpm test:coverage

# Specific project
pnpm test:e2e -- --project=smoke

# Rust tests
cargo test --workspace
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Playwright Documentation](https://playwright.dev/)
- [Rust Testing Guide](https://doc.rust-lang.org/book/ch11-00-testing.html)
