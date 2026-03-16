# Web App Testing Setup Guide

## Environment Setup

### Prerequisites

```bash
# Minimum versions
Node.js: 20.x
pnpm: 9.15.0+
```

### Installation

```bash
# Install dependencies (includes all test tools)
pnpm install

# Verify installation
pnpm test --version  # Vitest version
```

---

## Vitest Configuration

### Configuration File: `vitest.config.ts`

```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom', // Browser-like environment for React
    globals: true, // Global test functions (describe, it, expect)
    setupFiles: ['./test/setup.ts'], // Global setup before tests
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/', '.next/', 'dist/'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    mockReset: true, // Clear mocks between tests
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@core': path.resolve(__dirname, './core'),
      // ... other aliases
    },
  },
});
```

### Key Configuration Explained

| Option                    | Purpose                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `environment: 'jsdom'`    | Simulates browser DOM in Node.js (vs. 'node' for non-DOM tests)  |
| `globals: true`           | Auto-import `describe`, `it`, `expect` (no manual import needed) |
| `setupFiles`              | Runs before all tests (global mocks, polyfills)                  |
| `coverage.provider: 'v8'` | Uses V8 engine for coverage (accurate, built-in)                 |
| `mockReset: true`         | Clears mock call history after each test                         |

---

## Global Test Setup: `test/setup.ts`

### Purpose

Configures the global test environment, sets up mocks, and polyfills before any tests run.

### Key Sections

#### 1. Jest-DOM Matchers

```typescript
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);
```

Adds matchers like:

- `.toBeInTheDocument()`
- `.toBeVisible()`
- `.toHaveAttribute()`

#### 2. Cleanup After Each Test

```typescript
afterEach(() => {
  cleanup(); // Clear React components and DOM
});
```

Prevents test pollution from previous tests.

#### 3. Radix UI Pointer Capture Polyfills

```typescript
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => {};
HTMLElement.prototype.releasePointerCapture = () => {};
```

**Why**: Radix UI components use pointer events (not implemented in jsdom).

#### 4. Environment Variables

```typescript
process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://test.supabase.co';
process.env['STRIPE_SECRET_KEY'] = 'sk_test_key';
// ... other test variables
```

Provides default test values for all environment variables.

#### 5. Mock `next/headers`

```typescript
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => ({ value: 'test-cookie' })),
    getAll: vi.fn(() => []),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));
```

Allows Next.js `cookies()` function to work in tests without real HTTP.

#### 6. Mock `server-only` Module

```typescript
vi.mock('server-only', () => ({}));
```

Prevents errors when importing server-only code in tests.

#### 7. Mock `framer-motion`

```typescript
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }, ref) =>
      React.createElement('div', { ref, ...props }, children),
    ),
    // ... other elements
  },
  AnimatePresence: ({ children }) => children,
}));
```

**Why**: `framer-motion` tries to parse CSS transforms, which fails in jsdom. We render motion components without animation.

---

## Mock Setup: `test/__mocks__/`

### Server (MSW): `test/mocks/server.ts`

**Mock Server Workers** intercepts HTTP requests at the network level.

```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

// Setup/teardown for all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Handlers: `test/mocks/handlers.ts`

```typescript
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/user', () =>
    HttpResponse.json({
      id: '1',
      email: 'user@example.com',
      name: 'Test User',
    }),
  ),

  http.post('/api/chat/messages', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      id: 'msg-1',
      content: body.content,
      role: 'assistant',
    });
  }),

  // ... other handlers
];
```

### Using MSW in Tests

```typescript
import { server } from '@/test/mocks/server';
import { http, HttpResponse } from 'msw';

test('should fetch user data', async () => {
  // Override handler for this test
  server.use(http.get('/api/user', () => HttpResponse.json({ id: '2', name: 'John Doe' })));

  const response = await fetch('/api/user');
  const user = await response.json();

  expect(user.name).toBe('John Doe');
});

test('should handle API error', async () => {
  // Override with error response
  server.use(
    http.get('/api/user', () => HttpResponse.json({ error: 'Not found' }, { status: 404 })),
  );

  const response = await fetch('/api/user');
  expect(response.status).toBe(404);
});
```

---

## Custom Test Utilities and Helpers

### Render with Providers: `test/utils/render.tsx`

Components often need providers (React Query, Zustand, etc.):

```typescript
import { render as rtlRender } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function renderWithProviders(
  component: React.ReactElement,
  { ...options } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return rtlRender(component, { wrapper: Wrapper, ...options });
}

export * from '@testing-library/react';
export { renderWithProviders as render };
```

**Note:** Next.js (App Router) doesn't require BrowserRouter. For client components, use `'use client'` directive. For server component testing or route testing, use Playwright E2E tests instead.

### Usage in Tests

```typescript
import { render, screen, userEvent } from '@/test/utils/render';

test('should render with providers', () => {
  render(<MyComponent />);
  expect(screen.getByRole('button')).toBeInTheDocument();
});
```

### Mock Data Factory: `test/utils/factories.ts`

```typescript
export const createMockUser = (overrides?: Partial<User>): User => ({
  id: '1',
  email: 'user@example.com',
  name: 'Test User',
  ...overrides,
});

export const createMockMessage = (overrides?: Partial<Message>): Message => ({
  id: '1',
  content: 'Hello',
  role: 'user',
  timestamp: new Date(),
  ...overrides,
});

export const createMockConversation = (overrides?: Partial<Conversation>): Conversation => ({
  id: '1',
  title: 'Test Conversation',
  messages: [],
  createdAt: new Date(),
  ...overrides,
});
```

### Usage in Tests

```typescript
test('should display user info', () => {
  const user = createMockUser({ name: 'Jane Doe' });
  render(<UserCard user={user} />);
  expect(screen.getByText('Jane Doe')).toBeInTheDocument();
});
```

---

## Setting Up Local Test Environment

### Step 1: Install Dependencies

```bash
cd apps/web
pnpm install
```

### Step 2: Verify Setup

```bash
# Run a simple test
pnpm test --grep "should render"

# Expected output:
# ✓ Sample test passes
```

### Step 3: Configure IDE (Optional but Recommended)

#### VS Code

1. Install `Vitest` extension (vitest.explorer)
2. Create `.vscode/settings.json`:

```json
{
  "vitest.commandLine": "pnpm vitest",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

#### WebStorm/IntelliJ

1. Enable Vitest in: Settings → Languages & Frameworks → JavaScript → Tests → Vitest
2. Tests will run with green/red gutter icons

### Step 4: Setup Git Hooks (Optional)

Pre-commit hook to run tests on related files:

```bash
# Install husky (if not already installed)
pnpm add -D husky
pnpm husky install

# Create hook
cat > .husky/pre-commit << 'EOF'
#!/bin/sh
pnpm test --changed
EOF
chmod +x .husky/pre-commit
```

---

## Environment Variables for Testing

### Test `.env.local`

Create `apps/web/.env.test.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key
SUPABASE_SERVICE_ROLE_KEY=test-service-role-key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_123
STRIPE_SECRET_KEY=sk_test_123
STRIPE_WEBHOOK_SECRET=whsec_test_secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Optional features
TOTP_ENCRYPTION_KEY=test-encryption-key
CSRF_SECRET=test-csrf-secret
```

### Note on Environment Variables

- Test setup automatically provides default values in `test/setup.ts`
- Individual tests can override with `process.env.VAR = 'value'`
- No need for separate `.env.test` file for most cases

---

## Running Tests in Different Environments

### Development (Watch Mode)

```bash
# Watch for file changes
pnpm test --watch

# Watch specific test file
pnpm test --watch features/chat/components/__tests__/Chat.test.tsx
```

### CI/CD (Single Run)

```bash
# Run all tests once
pnpm test

# With coverage
pnpm test:coverage

# Exit with error if coverage below threshold
pnpm test --coverage --coverage.thresholdAuto=false --coverage.lines=80
```

### Interactive UI

```bash
# Opens browser UI for test exploration
pnpm test:ui

# Navigate to http://localhost:51204/__vitest__/
```

---

## Troubleshooting Setup

### Issue: "Cannot find module '@testing-library/react'"

**Solution**:

```bash
pnpm install @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

### Issue: "vi is not defined"

**Solution**: Ensure `globals: true` in `vitest.config.ts`

### Issue: "ReferenceError: self is not defined"

**Solution**: Check that `environment: 'jsdom'` is set in vitest config

### Issue: Tests hang/timeout

**Solution**:

```typescript
// Increase timeout for specific test
test(
  'slow operation',
  async () => {
    // ...
  },
  { timeout: 10000 },
);

// Or globally in vitest.config.ts
test: {
  testTimeout: 10000;
}
```

### Issue: Mocks not working

**Solution**:

```typescript
// Ensure mock is before component import
vi.mock('@/services/api');

// Clear mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});
```

---

## Advanced Configuration

### Custom Reporters

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    reporters: ['default', 'html', 'json'],
  },
});
```

Outputs:

- Console output (default)
- `coverage/index.html` (HTML report)
- `coverage/coverage-final.json` (JSON report)

### Coverage Thresholds

```typescript
// vitest.config.ts
coverage: {
  lines: 80,      // 80% line coverage required
  functions: 80,
  branches: 75,
  statements: 80,
}
```

### Snapshot Testing

```typescript
test('should render correctly', () => {
  const { container } = render(<Component />);
  expect(container).toMatchSnapshot();
});

// Update snapshots: pnpm test -u
```

---

## References

- **Vitest Setup**: https://vitest.dev/guide/
- **MSW Installation**: https://mswjs.io/docs/getting-started
- **React Testing Library**: https://testing-library.com/docs/react-testing-library/intro/
- **jest-dom Matchers**: https://github.com/testing-library/jest-dom

---

## Checklist: Testing Setup Complete

- [ ] Vitest configured in `vitest.config.ts`
- [ ] Test setup file at `test/setup.ts`
- [ ] MSW handlers in `test/mocks/`
- [ ] Custom test utilities in `test/utils/`
- [ ] Mock data factories available
- [ ] CI/CD pipeline runs tests
- [ ] IDE integration (optional) configured
- [ ] Team aware of testing setup and practices

---

**Document Version**: 1.0
**Last Updated**: 2026-03-16
