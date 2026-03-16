# Web App Testing Strategy

## Overview

This document outlines the comprehensive testing approach for the AGI Workforce web application. Our strategy ensures robust quality, maintainability, and confidence in production deployments through multi-layered testing coverage.

## Testing Philosophy

- **Test-Driven Development (TDD)**: Write tests before implementation for better design and confidence
- **Pyramid Approach**: More unit tests, fewer integration/E2E tests for faster feedback
- **Isolation**: Each test should be independent and not depend on others
- **Clarity**: Tests serve as executable documentation of expected behavior
- **Maintainability**: Tests should be easy to understand, update, and debug

## Test Categories

### 1. Unit Tests

**Purpose**: Test individual functions, utilities, and components in isolation.

**Characteristics**:

- Fast execution (typically <100ms per test)
- Minimal external dependencies (mocked)
- Focused on single responsibility
- High code coverage target (80%+)

**Location**: `**/src/**/*.test.ts` and `**/src/**/*.test.tsx`

**Examples**:

- Utility functions: `lib/utils.test.ts`
- React hooks: `hooks/__tests__/useHook.test.ts`
- Service classes: `core/services/*.test.ts`
- Store functions: `stores/__tests__/*.test.ts`

**Stack**: Vitest + React Testing Library + MSW (mocking)

---

### 2. Component Tests

**Purpose**: Test React components in isolation with props and state variations.

**Characteristics**:

- Use React Testing Library for DOM queries
- Test user interactions (clicks, typing, etc.)
- Verify component rendering and state changes
- Mock child components if needed
- Test accessibility (aria attributes, keyboard navigation)

**Location**: `components/**/__tests__/*.test.tsx`

**Typical Test Structure**:

```typescript
describe('ComponentName', () => {
  it('should render with default props', () => {
    render(<Component />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should handle user interactions', async () => {
    const user = userEvent.setup();
    render(<Component />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Updated')).toBeInTheDocument();
  });
});
```

---

### 3. Integration Tests

**Purpose**: Test how multiple components/modules work together, including API calls and state management.

**Characteristics**:

- Test user workflows (login, submit form, etc.)
- Verify API integration points
- Test state propagation across components
- Use MSW for HTTP mocking
- Typically slower than unit tests (100ms - 1s)

**Location**:

- `__tests__/api/*.test.ts` - API route testing
- `features/**/integration/*.test.tsx` - Feature integration tests
- `__tests__/auth/*.test.ts` - Authentication flows

**Example Integration Test**:

```typescript
describe('Login Flow', () => {
  it('should complete user login with valid credentials', async () => {
    // Setup MSW mock for auth API
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ user: mockUser })
      )
    );

    // Render page and interact
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // Verify navigation
    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard');
    });
  });
});
```

---

### 4. E2E Tests (Playwright)

**Purpose**: Test complete user workflows in a real browser environment.

**Characteristics**:

- Test actual browser behavior (not jsdom simulation)
- Verify visual elements and layout
- Test cross-browser compatibility
- Slower execution (1-10s per test)
- Run against deployed environments (staging/production)

**Location**: `e2e/*.spec.ts`

**Example E2E Test**:

```typescript
test('user can complete purchase flow', async ({ page }) => {
  await page.goto('/products');
  await page.click('text=Add to Cart');
  await page.goto('/checkout');

  // Fill payment form
  await page.fill('[name="cardNumber"]', '4242424242424242');

  // Complete purchase
  await page.click('button:has-text("Pay Now")');

  // Verify success page
  await expect(page).toHaveURL('/confirmation');
  await expect(page.locator('text=Order Confirmed')).toBeVisible();
});
```

---

## Test File Organization

```
apps/web/
├── __tests__/                          # API and integration tests
│   ├── api/                            # API route tests
│   │   ├── chat-messages.test.ts
│   │   ├── auth-callback.test.ts
│   │   └── ...
│   ├── auth/                           # Auth flow tests
│   │   ├── concurrent-login.test.ts
│   │   └── ...
│   └── integration/                    # Cross-module integration
│       └── ...
├── components/
│   └── ComponentName/
│       └── __tests__/
│           └── ComponentName.test.tsx  # Component-specific tests
├── features/
│   └── feature-name/
│       ├── components/
│       │   └── __tests__/
│       │       └── *.test.tsx
│       ├── hooks/
│       │   └── __tests__/
│       │       └── *.test.ts
│       └── services/
│           └── *.test.ts
├── lib/
│   ├── utils.test.ts                   # Utility function tests
│   └── ...
├── core/
│   ├── auth/
│   │   └── *.test.ts
│   ├── security/
│   │   └── *.test.ts
│   └── ...
├── e2e/                                # Playwright E2E tests
│   ├── checkout.spec.ts
│   ├── auth.spec.ts
│   └── ...
├── test/
│   ├── setup.ts                        # Vitest setup
│   └── __mocks__/                      # Global mocks
│       └── webcontainer-api.ts
└── vitest.config.ts                    # Vitest configuration
```

---

## Running Tests

### Local Development

```bash
# Run all unit/component tests
pnpm test

# Watch mode for development
pnpm test --watch

# Run specific test file
pnpm test features/chat/components/__tests__/ChatMessage.test.tsx

# Run tests matching pattern
pnpm test --grep "should handle user input"

# Run with UI viewer
pnpm test:ui
```

### Coverage Reports

```bash
# Generate coverage report
pnpm test:coverage

# Coverage report outputs to:
# - coverage/index.html (HTML report)
# - coverage/coverage-final.json (JSON for CI)
```

### E2E Testing

```bash
# Run Playwright E2E tests
pnpm test:e2e

# Run in UI mode (interactive)
pnpm test:e2e:ui

# Run specific test file
pnpm test:e2e e2e/checkout.spec.ts

# Run headed (see browser)
pnpm test:e2e --headed

# Debug mode
pnpm test:e2e --debug
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
- name: Run Unit Tests
  run: pnpm test

- name: Generate Coverage
  run: pnpm test:coverage

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/coverage-final.json

- name: Run E2E Tests
  run: pnpm test:e2e

- name: Upload E2E Videos
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: e2e-videos
    path: test-results/
```

---

## Mocking Strategy

### API Mocking (MSW)

Mock Server Workers (MSW) intercepts HTTP requests at the network level:

```typescript
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';

// Setup in test
beforeEach(() => {
  server.use(http.get('/api/user', () => HttpResponse.json({ id: '1', name: 'John Doe' })));
});
```

### Module Mocking (vi.mock)

For modules that can't be easily tested:

```typescript
vi.mock('@webcontainer/api', () => ({
  WebContainer: {
    boot: vi.fn().mockRejectedValue(new Error('Not available'))
  }
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children }: any) => <div>{children}</div>),
  }
}));
```

### Component Mocking

Mock child components for isolated testing:

```typescript
vi.mock('@/components/ExpensiveChild', () => ({
  ExpensiveChild: ({ onLoad }: any) => (
    <div>Mocked Child</div>
  )
}));
```

---

## Test Coverage Goals

| Category       | Target | Current |
| -------------- | ------ | ------- |
| Overall        | 80%    | TBD     |
| Critical paths | 95%    | TBD     |
| API routes     | 90%    | TBD     |
| Utils/Helpers  | 85%    | TBD     |
| Components     | 75%    | TBD     |
| Hooks          | 85%    | TBD     |

**Note**: Coverage is a guide, not a goal. Aim for meaningful coverage that tests behavior, not just line coverage.

---

## Best Practices

### DO

- ✅ Write tests that verify behavior, not implementation details
- ✅ Use semantic queries: `getByRole`, `getByLabelText`
- ✅ Test user interactions with `userEvent` not `fireEvent`
- ✅ Mock external dependencies (APIs, services)
- ✅ Keep tests focused and independent
- ✅ Use descriptive test names that explain the scenario
- ✅ Test accessibility features (aria attributes, keyboard navigation)
- ✅ Clean up after tests (cleanup library, close mocks)

### DON'T

- ❌ Test implementation details (internal state, private methods)
- ❌ Use `querySelector` or DOM traversal when possible
- ❌ Create dependencies between tests
- ❌ Test third-party libraries (assume they work)
- ❌ Skip flaky tests without fixing them
- ❌ Mock everything - only external dependencies
- ❌ Use `act()` warnings as an excuse to suppress them

---

## Debugging Failed Tests

### Common Issues

1. **Async/Timing Issues**
   - Use `waitFor()` for async state changes
   - Use `screen.findByRole()` for async queries
   - Increase timeout if needed: `waitFor(() => {...}, { timeout: 5000 })`

2. **Mock Not Working**
   - Verify mock is defined before component import
   - Check mock path matches actual import
   - Clear mocks between tests: `vi.clearAllMocks()`

3. **Component Not Rendering**
   - Wrap in providers (Router, QueryClient, etc.)
   - Check for missing context providers
   - Use `screen.debug()` to see rendered output

4. **Flaky Tests**
   - Avoid `setTimeout`, use `waitFor()`
   - Use `userEvent` instead of `fireEvent`
   - Mock time-based functions: `vi.useFakeTimers()`

### Debug Commands

```bash
# Print DOM to console
screen.debug();

# Print specific element
screen.debug(screen.getByRole('button'));

# List all queries available
screen.getByRole('');  // Check error message for available roles

# Run with verbose output
pnpm test --reporter=verbose
```

---

## Test Maintenance

### Updating Tests

1. **When code changes**: Update tests to match new behavior
2. **When tests fail**: Fix implementation, not tests (unless tests are wrong)
3. **When adding features**: Write tests first (TDD)
4. **When refactoring**: Ensure tests still pass without modification

### Removing Tests

Only remove tests if:

- Feature is deleted entirely
- Test is truly duplicative (not just similar)
- Test is testing implementation detail that changed

---

## Performance Optimization

### Test Optimization

- Use `test.concurrent()` for independent tests (runs in parallel)
- Mock expensive operations (file I/O, network calls)
- Use `describe.skip()` to temporarily disable slow tests
- Profile slow tests: `pnpm test --reporter=verbose`

### Example Concurrent Tests

```typescript
describe.concurrent('API endpoints', () => {
  test('GET /users', async () => {
    /* ... */
  });
  test('POST /users', async () => {
    /* ... */
  });
  test('DELETE /users/:id', async () => {
    /* ... */
  });
});
```

---

## References

- **Vitest Docs**: https://vitest.dev/
- **React Testing Library**: https://testing-library.com/react
- **MSW Docs**: https://mswjs.io/
- **Playwright**: https://playwright.dev/
- **Testing Library Best Practices**: https://kentcdodds.com/blog/common-mistakes-with-react-testing-library

---

## Sign-Off

This testing strategy document defines the approach for ensuring quality in the AGI Workforce web application. All team members should follow these guidelines when writing and maintaining tests.

**Document Version**: 1.0
**Last Updated**: 2026-03-16
**Maintained By**: Development Team
