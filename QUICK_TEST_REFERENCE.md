# Quick Test Reference Guide

**For Developers - Quick Lookup**

---

## At a Glance

```
Status:       PASSING ✅ (99.2% pass rate)
Tests:        666 total (661 passing, 5 skipped)
Time:         8.67 seconds full run
Issues:       2 minor (non-blocking)
```

---

## Run Tests

### Most Common Commands

```bash
# Just web tests (fast)
pnpm --filter web test

# Just desktop tests (medium)
pnpm --filter @agiworkforce/desktop test

# Just E2E tests (slow)
pnpm --filter @agiworkforce/desktop test:e2e

# Everything
pnpm test

# Watch mode (while coding)
pnpm --filter @agiworkforce/desktop test -- --watch

# Single test file
pnpm --filter @agiworkforce/desktop test -- ErrorBoundary.test.tsx

# Show coverage
pnpm --filter @agiworkforce/desktop test:coverage
```

---

## Test File Locations

**Web App Tests:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/`

**Desktop Tests:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/__tests__/`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/__tests__/`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/__tests__/`

**E2E Tests:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/e2e/`

---

## Known Issues & Fixes

### Issue 1: React act() Warnings

**File:** `src/__tests__/ErrorToast.test.tsx`

**Symptom:**

```
An update to ErrorToastContainer inside a test was not wrapped in act(...).
```

**Fix (15 minutes):**

```typescript
// Before
fireEvent.click(button);
expect(alert).toBeInTheDocument();

// After
await act(async () => {
  fireEvent.click(button);
});
expect(alert).toBeInTheDocument();
```

---

### Issue 2: 5 Skipped Tests

**File:** `src/components/UnifiedAgenticChat/__tests__/UnifiedAgenticChat.test.tsx`

**Status:** Need review to determine if tests should be enabled

**Check with:**

```bash
cd /Users/siddhartha/Desktop/agiworkforce
pnpm --filter @agiworkforce/desktop test -- UnifiedAgenticChat
```

---

## Performance

| Suite   | Time    | Avg/Test |
| ------- | ------- | -------- |
| Web     | 1.60s   | 10.4ms   |
| Desktop | 7.07s   | 13.8ms   |
| E2E     | ~30-60s | ~500ms   |

**Note:** Most time is environment setup (jsdom), not test execution.

---

## Coverage

```
Current:  75% estimated
Target:   80%+ (next quarter)

By Layer:
  - State/Stores:     85% ✅
  - Error Handling:   90% ✅
  - Services:         75% ✅
  - Utilities:        80% ✅
  - Components:       65% ✅
  - API Integration:  70% ✅
  - E2E/Integration:  60% ✅
```

---

## Test Organization

### Web App (7 files, 153 tests)

| Category   | Tests | Files |
| ---------- | ----- | ----- |
| API Routes | 32    | 2     |
| Services   | 37    | 2     |
| Libraries  | 47    | 2     |
| Utilities  | 37    | 1     |

### Desktop App (37 files, 513 tests)

| Category    | Tests | Files |
| ----------- | ----- | ----- |
| Stores      | 200+  | 20+   |
| Components  | 75+   | 8+    |
| Services    | 17    | 1     |
| Utilities   | 16    | 1     |
| Automation  | 39    | 2     |
| Integration | 12+   | 5+    |

---

## CI/CD Integration

**Current Status:** Not in CI/CD pipeline yet

**Recommended Setup:**

```yaml
# .github/workflows/test.yml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 22.12.0
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test
```

---

## Debug a Failing Test

1. **Run test in watch mode:**

   ```bash
   pnpm --filter @agiworkforce/desktop test -- --watch ErrorBoundary
   ```

2. **Check test setup:**
   - Look for mock configuration
   - Verify test fixtures are correct
   - Check for timing issues (use act() wrapper)

3. **Add debug logs:**

   ```typescript
   console.log('Debug value:', value);
   ```

4. **Check error message:**
   - Usually tells you what's wrong
   - Compare expected vs. actual

5. **Isolate the issue:**
   ```typescript
   test.only('this one test', () => {
     // Only this test runs
   });
   ```

---

## Common Test Patterns

### Zustand Store Test

```typescript
import { useStore } from '@/stores/myStore';

test('should update state', () => {
  const { getState, setState } = useStore;

  setState({ value: 'test' });

  expect(getState().value).toBe('test');
});
```

### React Component Test

```typescript
import { render, screen, fireEvent } from '@testing-library/react';

test('should render button', () => {
  render(<MyComponent />);

  expect(screen.getByRole('button')).toBeInTheDocument();
});

test('should handle click', async () => {
  render(<MyComponent />);

  await act(async () => {
    fireEvent.click(screen.getByRole('button'));
  });

  expect(screen.getByText('Clicked')).toBeInTheDocument();
});
```

### API Test

```typescript
test('should fetch data', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    json: async () => ({ id: 1, name: 'Test' }),
  } as Response);

  const result = await fetchData();

  expect(result.name).toBe('Test');
});
```

---

## Test Naming Convention

Good test names:

```typescript
test('should update user profile when form is submitted', () => {});
test('should show error when email is invalid', () => {});
test('should handle network timeout gracefully', () => {});
```

Bad test names:

```typescript
test('test user profile', () => {});
test('error handling', () => {});
test('it works', () => {});
```

---

## Performance Tips

1. **Use `test.skip()` for slow tests during development**

   ```typescript
   test.skip('slow e2e test', () => {
     /* ... */
   });
   ```

2. **Mock external dependencies**

   ```typescript
   vi.mock('@/api', () => ({
     fetchUser: vi.fn(() => Promise.resolve({ id: 1 })),
   }));
   ```

3. **Use fixtures for common setup**

   ```typescript
   const mockUser = { id: 1, name: 'Test' };
   test('...', () => {
     /* use mockUser */
   });
   ```

4. **Isolate tests** - avoid shared state

---

## When to Write Tests

### Must Test

- [ ] Business logic (calculations, transformations)
- [ ] Error scenarios (what happens when things fail)
- [ ] User interactions (clicks, form submissions)
- [ ] State changes (store updates)
- [ ] API integration (requests/responses)

### Should Test

- [ ] Complex components
- [ ] Utility functions
- [ ] Edge cases
- [ ] Integration between features

### Nice to Have

- [ ] Simple UI components
- [ ] Navigation
- [ ] Styling
- [ ] Basic rendering

---

## Troubleshooting

### Problem: Test hangs forever

**Solution:** Check for missing `await`, increase timeout

```typescript
test('...', async () => {
  await act(async () => {
    // your code
  });
}, 10000); // 10 second timeout
```

### Problem: Mock not working

**Solution:** Verify mock is before import

```typescript
vi.mock('@/api'); // must be before imports
import { fetchData } from '@/api';
```

### Problem: Store state not updating

**Solution:** Use act() wrapper

```typescript
await act(async () => {
  store.setState({ value: 'new' });
});
```

### Problem: Component not found

**Solution:** Check if render worked, use screen.debug()

```typescript
render(<MyComponent />);
screen.debug(); // prints entire DOM
```

---

## Reporting Issues

1. **Include test output**

   ```bash
   pnpm --filter @agiworkforce/desktop test -- MyTest.test.tsx 2>&1 | tee issue.txt
   ```

2. **Include your environment**

   ```bash
   node --version
   pnpm --version
   ```

3. **Include reproduction steps**
   - How to run the test
   - What goes wrong
   - What you expected

---

## Resources

- **Test Files:** See file paths above
- **Test Commands:** See "Run Tests" section
- **Detailed Report:** `TEST_REPORT.md`
- **Issue Fixes:** `TEST_ISSUES_AND_FIXES.md`
- **Metrics:** `TEST_METRICS_AND_RECOMMENDATIONS.md`
- **CLAUDE.md:** Project guidelines

---

## Quick Stats

```
Total Tests:        666
Passing:            661 (99.2%)
Skipped:            5 (0.75%)
Failed:             0 (0%)
Time to Run:        8.67 seconds
Critical Issues:    0
Warnings:           2 (non-blocking)
```

---

**Last Updated:** 2026-01-15
**Test Framework:** Vitest 4.0.16
**E2E Framework:** Playwright
