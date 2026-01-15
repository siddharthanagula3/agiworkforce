# Test Issues and Fixes

**Status:** Action Items for Test Suite Maintenance
**Date:** 2026-01-15

---

## Priority 1: React act() Warnings (LOW PRIORITY)

### Issue: ErrorToast Component Tests Not Wrapped in act()

**Location:** `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/__tests__/ErrorToast.test.tsx`

**Problem:**

```
An update to ErrorToastContainer inside a test was not wrapped in act(...).
```

**Affected Tests:**

1. `ErrorToast > ErrorToastContainer > should render toast when error is added`
2. `ErrorToast > ErrorToastContainer > should dismiss toast when X button is clicked`

**Root Cause:**
State updates triggered by event handlers are not being waited for or wrapped in React's `act()` function. This causes React to warn that the test is not properly simulating user interactions.

**Current Behavior:**

- Tests pass despite warnings
- Warnings appear in stderr output
- No functional impact on production code

**Fix Instructions:**

1. **Open the test file:**

   ```bash
   code /Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/__tests__/ErrorToast.test.tsx
   ```

2. **Find and update affected tests:**

   **Before:**

   ```typescript
   test('should render toast when error is added', () => {
     const { rerender } = render(
       <ErrorToastContainer />
     );

     // Directly update store without wrapping
     useErrorStore.setState({ errors: [mockError] });

     expect(queryByRole('alert')).toBeInTheDocument();
   });
   ```

   **After:**

   ```typescript
   test('should render toast when error is added', async () => {
     const { rerender } = render(
       <ErrorToastContainer />
     );

     // Wrap state update in act()
     await act(async () => {
       useErrorStore.setState({ errors: [mockError] });
     });

     expect(queryByRole('alert')).toBeInTheDocument();
   });
   ```

3. **Apply same fix to test 2:**

   ```typescript
   test('should dismiss toast when X button is clicked', async () => {
     const { getByRole } = render(<ErrorToastContainer />);

     await act(async () => {
       useErrorStore.setState({ errors: [mockError] });
     });

     const closeButton = getByRole('button', { name: /close|dismiss|x/i });

     await act(async () => {
       fireEvent.click(closeButton);
     });

     expect(queryByRole('alert')).not.toBeInTheDocument();
   });
   ```

**Estimated Effort:** 15 minutes

**Verification:**

```bash
cd /Users/siddhartha/Desktop/agiworkforce
pnpm --filter @agiworkforce/desktop test -- ErrorToast.test.tsx
# Should show no act() warnings in stderr
```

---

## Priority 2: Skipped Tests in UnifiedAgenticChat (LOW PRIORITY)

### Issue: 5 Tests Skipped

**Location:** `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/__tests__/UnifiedAgenticChat.test.tsx`

**Problem:**

```
✓ src/components/UnifiedAgenticChat/__tests__/UnifiedAgenticChat.test.tsx (5 tests | 5 skipped)
```

**Current Status:**

- 5 tests are skipped (marked with `.skip` or commented out)
- Tests don't run, so behavior is unknown

**Investigation Steps:**

1. **Open the test file:**

   ```bash
   code /Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/__tests__/UnifiedAgenticChat.test.tsx
   ```

2. **Find skipped tests** - Look for:

   ```typescript
   test.skip('...', () => {});
   // or
   it.skip('...', () => {});
   // or
   xit('...', () => {});
   ```

3. **Check skip reason:**
   - Look for comments explaining why tests are skipped
   - Common reasons:
     - `// TODO: Fix after refactor`
     - `// Blocked by feature X`
     - `// Complex setup needed`
     - `// Pending implementation`

4. **Decision Matrix:**

   | Reason                 | Action                                        |
   | ---------------------- | --------------------------------------------- |
   | Blocked by feature     | Update skip reason comment with ticket number |
   | Complex setup          | Refactor setup helpers, enable tests          |
   | Intentionally disabled | Document why and how long                     |
   | Legacy tests           | Consider if test still applies                |

5. **Enable Tests (if applicable):**

   ```typescript
   // Before
   test.skip('should handle message input', () => {
     // ...
   });

   // After
   test('should handle message input', () => {
     // Ensure setup is correct
     // ...
   });
   ```

**Estimated Effort:** 30 minutes

**Verification:**

```bash
cd /Users/siddhartha/Desktop/agiworkforce
pnpm --filter @agiworkforce/desktop test -- UnifiedAgenticChat.test.tsx
# Should show all 5 tests passing (or clear reason for skip)
```

---

## Priority 3: Test Logging and Error Scenarios (INFORMATIONAL)

### Issue: Expected Error Logs in Test Output

**Files Affected:**

- Multiple test files that test error handling

**Current Behavior:**
Test output contains logs like:

```
[ERROR] Connection failed { type: 'NETWORK_ERROR' }
[WARNING] File error { type: 'FILE_ERROR' }
[ERROR] Test error { type: 'TEST_ERROR' }
```

**Analysis:**
✅ **This is EXPECTED and CORRECT** - These are mock errors being tested

**Reason:**
Tests specifically verify that error handling works correctly. When a test simulates:

- Network failures
- File operation errors
- Test setup errors

The test framework logs these intentionally to verify the application handles them gracefully.

**Why This is Good:**

- Demonstrates robust error recovery
- Tests both happy path and failure scenarios
- Proves error handlers actually catch and process errors

**No Action Required** - These warnings are part of the test design.

---

## Additional Testing Recommendations

### 1. Improve Test Performance (OPTIONAL)

**Current Performance:**

- Desktop tests: 7.07s total (10.19s actual test execution)
- Web tests: 1.60s total (171ms actual test execution)

**Optimization Opportunities:**

```typescript
// Before: Slow setup
beforeEach(() => {
  const store = createTestStore();
  configureTestEnvironment();
  mockAllProviders();
  // Takes 500ms+
});

// After: Lazy setup
beforeEach(() => {
  vi.clearAllMocks(); // 10ms
});
test('specific test', async () => {
  const store = createTestStore(); // Only if needed
  // Test runs faster
});
```

**Estimated Savings:** 2-3 seconds per test run

---

### 2. Add Missing Test Coverage (OPTIONAL)

**Gaps Identified:**

| Area            | Current     | Recommended                  |
| --------------- | ----------- | ---------------------------- |
| E2E Tests       | Multiple ✅ | Consider CI/CD integration   |
| API Integration | Good ✅     | Add more provider tests      |
| Desktop ↔ Tauri | Limited     | Add command invocation tests |
| Error Recovery  | Good ✅     | Add timeout scenarios        |
| Accessibility   | None        | Add a11y tests               |

**Add Accessibility Tests Example:**

```typescript
import { axe } from 'jest-axe';

test('ErrorBoundary has no accessibility violations', async () => {
  const { container } = render(<ErrorBoundary>{<div>content</div>}</ErrorBoundary>);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

---

### 3. CI/CD Integration (IMPORTANT)

**Recommended GitHub Actions Workflow:**

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        test-suite: [web, desktop]
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 9.15.3

      - uses: actions/setup-node@v4
        with:
          node-version: 22.12.0
          cache: 'pnpm'

      - run: pnpm install

      - run: pnpm typecheck:all

      - run: pnpm --filter @agiworkforce/${{ matrix.test-suite }} test

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        if: always()
        with:
          flags: ${{ matrix.test-suite }}
          fail_ci_if_error: false

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 22.12.0
          cache: 'pnpm'

      - run: pnpm install

      - run: pnpm --filter @agiworkforce/desktop test:e2e

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: apps/desktop/playwright-report/
```

---

## Test Maintenance Checklist

Use this checklist for ongoing test maintenance:

### Weekly

- [ ] Run full test suite: `pnpm test` (all packages)
- [ ] Check for new flaky tests
- [ ] Review CI/CD pipeline runs

### Monthly

- [ ] Review test coverage reports
- [ ] Update test dependencies: `pnpm update --latest`
- [ ] Archive/document old test results
- [ ] Review skipped tests status

### Quarterly

- [ ] Refactor slow tests (aim for <100ms per test)
- [ ] Update mock data to match current schema
- [ ] Add tests for new features
- [ ] Review test framework updates

### Before Release

- [ ] Run full test suite including E2E
- [ ] Generate coverage report
- [ ] Manual smoke test on actual device
- [ ] Check for deprecation warnings

---

## Test Execution Reference

### Quick Commands

```bash
# Web app tests only
pnpm --filter web test

# Desktop unit/component tests only
pnpm --filter @agiworkforce/desktop test

# Desktop E2E tests only
pnpm --filter @agiworkforce/desktop test:e2e

# All tests (sequential)
pnpm test

# Watch mode (useful during development)
pnpm --filter @agiworkforce/desktop test -- --watch

# Single test file
pnpm --filter @agiworkforce/desktop test -- ErrorBoundary.test.tsx

# With coverage
pnpm --filter @agiworkforce/desktop test:coverage
pnpm --filter web test:coverage

# E2E with UI (debugging)
pnpm --filter @agiworkforce/desktop test:e2e -- --ui

# Specific E2E project
pnpm --filter @agiworkforce/desktop test:e2e -- --project=smoke
pnpm --filter @agiworkforce/desktop test:e2e -- --project=chat
```

### Configuration Files

- **Web Config:** `/Users/siddhartha/Desktop/agiworkforce/apps/web/vitest.config.ts`
- **Desktop Config:** `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/vitest.config.ts`
- **E2E Config:** `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/playwright.config.ts`

---

## Summary of Action Items

| Priority | Issue                 | Status   | Effort | Action                               |
| -------- | --------------------- | -------- | ------ | ------------------------------------ |
| LOW      | React act() warnings  | 2 tests  | 15 min | Wrap state updates in act()          |
| LOW      | Skipped tests         | 5 tests  | 30 min | Review skip reasons, enable if ready |
| INFO     | Expected error logs   | N/A      | -      | No action (expected behavior)        |
| MEDIUM   | E2E CI/CD integration | Optional | 1-2 hr | Add GitHub Actions workflow          |
| MEDIUM   | Test optimization     | Optional | 1-2 hr | Refactor slow test setups            |
| LOW      | Accessibility tests   | Optional | 2-3 hr | Add jest-axe integration             |

---

**Next Steps:**

1. Fix the React act() warnings (15 minutes)
2. Review skipped tests (30 minutes)
3. Consider CI/CD integration (1-2 hours)
4. Schedule quarterly test maintenance review

**Questions?** Check test files at:

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/__tests__/`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/__tests__/`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/e2e/`
