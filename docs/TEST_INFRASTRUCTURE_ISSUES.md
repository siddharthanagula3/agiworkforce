# Test Infrastructure Issues & Recommendations

**Date**: 2026-03-16
**Scope**: Web app Vitest configuration, mock setup, test patterns
**Status**: ACTIVE BLOCKERS + RECOMMENDATIONS

---

## Critical Infrastructure Issues

### Issue #1: Missing Mock Factory for systemPromptsService

**Severity**: CRITICAL
**Status**: BLOCKING (3 test failures)
**Affected Tests**:

- `features/chat/services/chat-ai-service.test.ts` (lines 86, 92, 102)

**Current State**:

```typescript
// chat-ai-service.test.ts
vi.mock('features/chat/services/system-prompts-service', () => ({
  systemPromptsService: {
    // Missing: getAvailableEmployees()
    // Missing: getAvailableSkills()
    // Missing: generatePrompt()
  },
}));
```

**Impact**:

- Unhandled promise rejection at runtime
- `chat-ai-service.loadEmployees()` calls `.then()` on undefined
- Tests cannot measure coverage until fixed

**Recommended Solution**:

Create `/apps/web/test/factories/system-prompts-service.mock.ts`:

```typescript
export const createMockSystemPromptsService = () => ({
  getAvailableEmployees: vi.fn(() =>
    Promise.resolve([
      {
        id: 'emp-analyst',
        name: 'Analyst',
        category: 'professional',
        description: 'Data analysis specialist',
      },
      {
        id: 'emp-developer',
        name: 'Developer',
        category: 'technical',
        description: 'Software engineer',
      },
    ]),
  ),

  getAvailableSkills: vi.fn(() =>
    Promise.resolve([
      {
        id: 'skill-python',
        name: 'Python',
        category: 'coding',
        proficiency: 'expert',
      },
      {
        id: 'skill-data-analysis',
        name: 'Data Analysis',
        category: 'analysis',
        proficiency: 'expert',
      },
    ]),
  ),

  generatePrompt: vi.fn(async (skillId: string) => 'Generated prompt for ' + skillId),

  getSuggestedPrompts: vi.fn(() =>
    Promise.resolve(['Suggest 5 Python functions', 'Analyze this dataset']),
  ),

  // Add other methods as needed
});

export const mockSystemPromptsService = createMockSystemPromptsService();
```

Then update `chat-ai-service.test.ts`:

```typescript
import { mockSystemPromptsService } from '../../test/factories/system-prompts-service.mock';

vi.mock('features/chat/services/system-prompts-service', () => ({
  systemPromptsService: mockSystemPromptsService,
}));
```

**Implementation Time**: 2 hours (include all missing methods)

---

### Issue #2: Inconsistent Mock Reset Between Tests

**Severity**: HIGH
**Status**: ACTIVE
**Pattern**: Tests leak state between suites

**Example**:

```typescript
describe('Suite A', () => {
  it('test 1', () => {
    const mock = vi.fn().mockReturnValue('A');
    // Mock configured but not reset
  });
});

describe('Suite B', () => {
  it('test 2', () => {
    // Mock from Suite A may still be active
    // Causes flaky tests
  });
});
```

**Vitest Config Currently Has**:

```typescript
export default defineConfig({
  test: {
    mockReset: true, // Resets between tests, but...
    // ... doesn't reset vi.fn() that are shared
  },
});
```

**Recommended Solution**:

1. Use `beforeEach` for isolated mock setup:

```typescript
describe('ChatComposerNew', () => {
  let mockOnSubmit: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockOnSubmit = vi.fn()
    vi.clearAllMocks()
  })

  it('test 1', () => {
    render(<ChatComposerNew onSubmit={mockOnSubmit} />)
    // ...
  })

  it('test 2', () => {
    render(<ChatComposerNew onSubmit={mockOnSubmit} />)
    // mockOnSubmit is fresh, not polluted from test 1
  })
})
```

2. Create test utilities:

```typescript
// test/utils/test-helpers.ts
export const createTestContext = () => ({
  mocks: {
    onSubmit: vi.fn(),
    onDelete: vi.fn(),
    onUpdate: vi.fn()
  },
  reset: () => {
    vi.clearAllMocks()
  }
})

// In test:
describe('Component', () => {
  let ctx: ReturnType<typeof createTestContext>

  beforeEach(() => {
    ctx = createTestContext()
  })

  it('test', () => {
    render(<Component onSubmit={ctx.mocks.onSubmit} />)
  })
})
```

**Implementation Time**: 4 hours (refactor existing tests)

---

### Issue #3: Inadequate Async Test Patterns

**Severity**: MEDIUM
**Status**: WIDESPREAD
**Pattern**: Tests not properly waiting for async operations

**Examples Found**:

```typescript
// WRONG: Returns immediately without waiting
it('should load data', () => {
  render(<Component />)
  // Component calls useEffect → fetch → setData
  // But test doesn't wait
  expect(screen.getByText('Data')).toBeInTheDocument() // Fails!
})

// WRONG: Manual setTimeout
it('should load data', async () => {
  render(<Component />)
  await new Promise(r => setTimeout(r, 500)) // Flaky!
  expect(screen.getByText('Data')).toBeInTheDocument()
})

// CORRECT: Use waitFor
it('should load data', async () => {
  render(<Component />)
  await waitFor(() => {
    expect(screen.getByText('Data')).toBeInTheDocument()
  })
})
```

**Recommended Solution**:

Create `/apps/web/test/utils/async-helpers.ts`:

```typescript
import { waitFor, screen } from '@testing-library/react';

/**
 * Wait for element to appear in DOM
 * @param text - Text or regex to find
 * @param options - waitFor options
 */
export const waitForText = async (
  text: string | RegExp,
  options?: Parameters<typeof waitFor>[1],
) => {
  await waitFor(
    () => {
      expect(screen.getByText(text)).toBeInTheDocument();
    },
    { timeout: 3000, ...options },
  );
};

/**
 * Wait for text to be removed (avoid naming conflict with Testing Library)
 */
export const waitForTextToBeRemoved = async (text: string | RegExp) => {
  await waitFor(
    () => {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    },
    { timeout: 3000 },
  );
};

/**
 * Wait for multiple elements
 */
export const waitForTexts = async (...texts: Array<string | RegExp>) => {
  await waitFor(() => {
    texts.forEach((text) => {
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });
};
```

Then update test setup:

```typescript
// test/setup.ts
import { waitForText, waitForTextToBeRemoved } from './utils/async-helpers';

// Make available globally
Object.assign(globalThis, {
  waitForText,
  waitForTextToBeRemoved,
});
```

Use in tests:

```typescript
it('should load data', async () => {
  render(<Component />)
  await waitForText('Data loaded')
  expect(screen.getByText('Data loaded')).toBeInTheDocument()
})
```

**Implementation Time**: 3 hours

---

### Issue #4: No Component Test Harness/Wrapper

**Severity**: MEDIUM
**Status**: MISSING INFRASTRUCTURE

**Problem**: Tests must manually set up providers, stores, contexts

**Current Pattern** (tedious):

```typescript
it('test', () => {
  render(
    <QueryClientProvider client={queryClient}>
      <Zustand_Provider store={store}>
        <Theme>
          <Component />
        </Theme>
      </Zustand_Provider>
    </QueryClientProvider>
  )
})
```

**Recommended Solution**:

Create `/apps/web/test/utils/test-wrapper.tsx`:

```typescript
import { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/services/api-client'

/**
 * Test wrapper with all necessary providers
 * Use as: render(<Component />, { wrapper: TestWrapper })
 */
export const TestWrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <Theme>
      {children}
    </Theme>
  </QueryClientProvider>
)

/**
 * Custom render function with TestWrapper
 */
export const renderWithProviders = (
  ui: ReactNode,
  options?: RenderOptions
) => {
  return render(ui, { wrapper: TestWrapper, ...options })
}
```

Then use in all tests:

```typescript
import { renderWithProviders } from '@/test/utils/test-wrapper'

it('test', () => {
  renderWithProviders(<Component />)
  expect(screen.getByText('...')).toBeInTheDocument()
})
```

**Implementation Time**: 2 hours

---

### Issue #5: No Zustand Store Test Utilities

**Severity**: MEDIUM
**Status**: MISSING

**Problem**: Store tests are verbose and repetitive

**Current Pattern**:

```typescript
it('test store', () => {
  const store = create(chatStore);
  const { getState, setState } = store;

  // Lots of boilerplate
  const state = getState();
  expect(state.messages).toEqual([]);
});
```

**Recommended Solution**:

Create `/apps/web/test/utils/zustand-helpers.ts`:

```typescript
import { create, StoreApi } from 'zustand';

/**
 * Create isolated store instance for testing
 */
export const createTestStore = <T extends object>(initialState: T, reducers: any): StoreApi<T> => {
  return create<T>((set) => ({
    ...initialState,
    ...reducers(set),
  }));
};

/**
 * Helper to test store mutations
 */
export const testStoreAction = async <T extends object>(
  store: StoreApi<T>,
  action: () => void | Promise<void>,
  assertion: (state: T) => void,
) => {
  await action();
  const state = store.getState();
  assertion(state);
};

/**
 * Subscribe and track changes
 */
export const subscribeToChanges = <T extends object>(store: StoreApi<T>) => {
  const changes: Partial<T>[] = [];
  store.subscribe((state) => {
    changes.push(state);
  });
  return changes;
};
```

**Implementation Time**: 2 hours

---

## Recommended Test Infrastructure Improvements

### Priority 1: Essential (Do First)

1. **Create Mock Factories** (3-4 hours)
   - systemPromptsService ← CRITICAL NOW
   - supabaseClient
   - queryClient
   - zustand stores

2. **Create Test Wrapper** (2 hours)
   - Replaces manual provider setup
   - Consistent across all tests

3. **Create Async Test Helpers** (3 hours)
   - Eliminates setTimeout patterns
   - Standard waitFor utilities

### Priority 2: Important (This Sprint)

4. **Create Zustand Test Utils** (2 hours)
5. **Create Component Test Utils** (2 hours)
6. **Fix Mock Reset Strategy** (4 hours)

### Priority 3: Nice-to-Have

7. **Visual Regression Testing** (Percy/Chromatic)
8. **E2E Test Framework** (Playwright setup)
9. **Performance Testing** (React DevTools profiler integration)

---

## Files to Create

```
test/
├── factories/
│   ├── system-prompts-service.mock.ts        ← CRITICAL
│   ├── supabase-client.mock.ts
│   ├── query-client.mock.ts
│   └── zustand-stores.mock.ts
├── utils/
│   ├── test-wrapper.tsx                      ← IMPORTANT
│   ├── async-helpers.ts                      ← IMPORTANT
│   ├── zustand-helpers.ts
│   ├── component-test-helpers.ts
│   └── test-data-builders.ts
├── fixtures/
│   ├── messages.fixtures.ts
│   ├── sessions.fixtures.ts
│   ├── artifacts.fixtures.ts
│   └── users.fixtures.ts
├── mocks/
│   └── webcontainer-api.ts                   ← Already exists
└── setup.ts                                   ← Update with globals
```

---

## Testing Best Practices to Document

### 1. Mock Organization

- Use factories for complex mocks
- Use fixtures for data
- Use test-utils for common patterns

### 2. Test Structure

```typescript
describe('Component Name', () => {
  // Setup
  let mockFn: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFn = vi.fn()
    vi.clearAllMocks()
  })

  describe('Feature Group', () => {
    it('should do X', () => {
      // Arrange
      const props = { onSubmit: mockFn }

      // Act
      renderWithProviders(<Component {...props} />)
      const button = screen.getByRole('button')
      await user.click(button)

      // Assert
      expect(mockFn).toHaveBeenCalled()
    })
  })
})
```

### 3. Async Patterns

- Always use `waitFor()` for async operations
- Use `user.click()` instead of `fireEvent.click()`
- Prefer `screen.getByRole()` over `getByTestId()`

### 4. Mocking Rules

- Mock external services (API, localStorage, etc.)
- Don't mock components under test
- Clear mocks between tests

---

## Validation Checklist

Before merging test infrastructure changes:

- [ ] No unhandled promise rejections
- [ ] All mocks properly reset between tests
- [ ] No flaky tests (run 10x)
- [ ] Test coverage metrics generated
- [ ] All test utilities documented
- [ ] Example tests created for each pattern

---

## Implementation Timeline

**Week 1** (CRITICAL):

- Mock factories for systemPromptsService ← DO THIS FIRST
- Test wrapper setup
- Document patterns

**Week 2** (IMPORTANT):

- Async test helpers
- Zustand test utils
- Refactor 10-15 existing tests as examples

**Week 3+** (NICE-TO-HAVE):

- Additional factories/fixtures
- Visual regression setup
- Performance testing

---

## References

- Vitest docs: https://vitest.dev/config/#coverage
- React Testing Library: https://testing-library.com/docs/react-testing-library/intro
- Testing Library patterns: https://testing-library.com/docs/queries/about
- Zustand testing: https://docs.pmnd.rs/zustand/guides/testing

**Report Created**: 2026-03-16
**Next Review**: After mock factory implementation
