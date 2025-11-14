# Test Cleanup and Isolation Guide

This document describes the test cleanup strategy and best practices for ensuring proper test isolation in the AGI Workforce desktop app test suite.

## Overview

Test isolation is critical for maintaining a reliable test suite. Without proper cleanup, tests can affect each other, leading to:

- Flaky tests (pass/fail depending on test order)
- State pollution (test modifications persist across runs)
- CI/CD issues (tests pass locally but fail in CI)
- Configuration drift (system settings change over time)

This guide explains how we handle settings cleanup to prevent these issues.

## Problem Statement

**Before cleanup hooks:**

- Settings tests modified theme, resource limits, autonomous mode, and auto-approval settings
- These changes persisted after tests completed
- Subsequent test runs started with modified settings
- Tests could interfere with each other depending on execution order

**Example scenario:**

```
Test 1: Changes theme to "dark"
Test 2: Expects theme to be "system" (default)  ❌ FAILS (still "dark" from Test 1)
```

## Solution: Settings Snapshots and Restoration

We capture settings before each test and restore them afterward, ensuring:

1. **Test Isolation**: Each test starts with a clean state
2. **No State Pollution**: Test modifications don't affect subsequent tests
3. **Reproducible Runs**: Tests pass consistently regardless of execution order
4. **CI/CD Reliability**: Consistent behavior across different environments

### Architecture

```
┌─────────────────────────────────────────────────┐
│ test.beforeEach()                               │
│ - Capture current settings snapshot             │
│ - Store for restoration                         │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│ Test execution                                  │
│ - Modify settings (theme, limits, etc.)        │
│ - Run assertions                               │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│ test.afterEach()                                │
│ - Restore settings from snapshot               │
│ - Handle errors gracefully                     │
│ - Don't throw (cleanup should not fail tests)  │
└─────────────────────────────────────────────────┘
```

## Cleanup Implementation

### 1. Settings Snapshot Interface

```typescript
interface SettingsSnapshot {
  theme?: string; // 'light' | 'dark' | 'system'
  language?: string; // Language code
  resourceLimits?: {
    cpu?: string; // CPU percentage limit
    memory?: string; // Memory percentage limit
  };
  autonomousMode?: boolean; // Autonomous execution toggle
  autoApproval?: boolean; // Auto-approval for safe operations
  providers?: {
    [key: string]: {
      apiKey?: string; // Provider API key
      enabled?: boolean; // Provider enabled status
    };
  };
}
```

### 2. SettingsPage Methods

#### `captureCurrentSettings(): Promise<SettingsSnapshot>`

Captures current settings state before test execution.

```typescript
test.beforeEach(async ({ settingsPage }) => {
  // Capture state before test
  const snapshot = await settingsPage.captureCurrentSettings();
});
```

**What it captures:**

- Theme selection
- Language preference
- Resource limits (CPU, memory)
- Autonomous mode state
- Auto-approval state
- Provider configurations

**Error handling:**

- Continues if individual settings can't be captured
- Returns partial snapshot if some settings are unavailable
- Logs debug messages for troubleshooting

#### `restoreFromSnapshot(snapshot): Promise<void>`

Restores settings to previously captured state.

```typescript
test.afterEach(async ({ settingsPage }) => {
  // Restore original state after test
  await settingsPage.restoreFromSnapshot(snapshot);
});
```

**Features:**

- Graceful error handling (doesn't throw)
- Logs warnings for individual restoration failures
- Saves all changes in a single operation
- Continues even if some settings fail to restore

### 3. Settings Cleanup Utility

Location: `e2e/utils/settings-cleanup.ts`

Provides helper class for managing settings snapshots:

```typescript
import { SettingsCleanup } from './utils/settings-cleanup';

test.afterEach(async ({ page, settingsPage }) => {
  const cleanup = new SettingsCleanup(page, settingsPage);
  await cleanup.restoreSettings();
});
```

## Best Practices

### 1. Always Capture Before Test

```typescript
test.beforeEach(async ({ settingsPage }) => {
  // ✅ GOOD: Capture settings state
  const snapshot = await settingsPage.captureCurrentSettings();
});

// ❌ BAD: Don't skip capture
test.beforeEach(async ({ page }) => {
  // Missing settings capture!
});
```

### 2. Use afterEach for Cleanup

```typescript
// ✅ GOOD: Cleanup in afterEach
test.afterEach(async ({ settingsPage }) => {
  await settingsPage.restoreFromSnapshot(snapshot);
});

// ❌ BAD: Cleanup at end of test (doesn't run if test fails)
test('example', async ({ settingsPage }) => {
  await settingsPage.restoreFromSnapshot(snapshot); // May not run!
});
```

### 3. Don't Throw in Cleanup

```typescript
// ✅ GOOD: Handle errors gracefully
test.afterEach(async ({ settingsPage }) => {
  try {
    await settingsPage.restoreFromSnapshot(snapshot);
  } catch (error) {
    console.error('Cleanup failed:', error);
    // Don't throw - test should complete
  }
});

// ❌ BAD: Throwing in cleanup blocks other hooks
test.afterEach(async ({ settingsPage }) => {
  await settingsPage.restoreFromSnapshot(snapshot);
  // If this throws, subsequent cleanup hooks won't run!
});
```

### 4. Log for Debugging

```typescript
// ✅ GOOD: Log snapshot state for debugging
test.beforeEach(async ({ settingsPage }) => {
  const snapshot = await settingsPage.captureCurrentSettings();
  console.log('Captured settings:', snapshot);
});

test.afterEach(async ({ settingsPage }) => {
  try {
    await settingsPage.restoreFromSnapshot(snapshot);
    console.log('Settings restored');
  } catch (error) {
    console.error('Failed to restore settings:', error);
  }
});
```

### 5. Group Related Tests

```typescript
// ✅ GOOD: Group settings tests
test.describe('Settings and Configuration', () => {
  let snapshot: SettingsSnapshot;

  test.beforeEach(async ({ settingsPage }) => {
    snapshot = await settingsPage.captureCurrentSettings();
  });

  test.afterEach(async ({ settingsPage }) => {
    await settingsPage.restoreFromSnapshot(snapshot);
  });

  // All tests in this describe block get cleanup
  test('test 1', ...);
  test('test 2', ...);
});
```

## Implementation Details

### What Gets Captured?

1. **Theme** - Light, dark, or system preference
2. **Language** - Selected language code
3. **Resource Limits** - CPU and memory percentage limits
4. **Autonomy Settings** - Autonomous mode toggle state
5. **Approval Settings** - Auto-approval toggle state
6. **Provider Config** - Provider API keys and enabled status

### What Doesn't Get Captured?

- Browser cache/cookies (handled by Playwright fixtures)
- Local database state (separate from settings)
- File system changes (not test responsibility)
- Network mocks (handled by mock fixtures)

### Error Scenarios

**Scenario 1: Element not visible**

```
captureCurrentSettings() → skips that setting → continues
Partial snapshot captured ✓
```

**Scenario 2: Element value unavailable**

```
Attempts to read value → catches error → logs debug message
Continues with other settings ✓
```

**Scenario 3: Restoration fails**

```
restoreFromSnapshot() → logs warning → continues
Test completes successfully (cleanup error doesn't fail test) ✓
```

## Testing the Cleanup

### Verify Test Isolation

Run tests in different orders and verify they all pass:

```bash
# Run all settings tests
pnpm test e2e/settings.spec.ts

# Run in specific order
pnpm test --testNamePattern="should change application theme"
pnpm test --testNamePattern="should configure resource limits"

# Both should pass regardless of order
```

### Check Settings State

After running tests, verify settings are restored:

1. Run a settings test: `pnpm test e2e/settings.spec.ts`
2. Check the app manually - settings should be unchanged
3. Check logs for restoration messages

### Debug Cleanup Issues

Enable detailed logging:

```typescript
test.afterEach(async ({ settingsPage }) => {
  const snapshot = await settingsPage.captureCurrentSettings();
  console.log('Restoring from:', JSON.stringify(snapshot, null, 2));
  await settingsPage.restoreFromSnapshot(snapshot);
  console.log('Restoration complete');
});
```

## Common Issues

### Issue 1: Settings Not Being Captured

**Symptom:** Snapshots are empty

**Solution:**

```typescript
// Check if settings page is visible
test.beforeEach(async ({ settingsPage }) => {
  await settingsPage.navigateToSettings();
  const snapshot = await settingsPage.captureCurrentSettings();
  if (Object.keys(snapshot).length === 0) {
    console.warn('No settings captured - ensure settings page loaded');
  }
});
```

### Issue 2: Restoration Fails Silently

**Symptom:** Settings not restored but no error shown

**Solution:**

```typescript
test.afterEach(async ({ settingsPage }) => {
  console.log('Before restore:', snapshot);
  await settingsPage.restoreFromSnapshot(snapshot);

  // Verify restoration
  const current = await settingsPage.captureCurrentSettings();
  console.log('After restore:', current);
});
```

### Issue 3: Timeout During Restoration

**Symptom:** Test times out when restoring settings

**Solution:**

- Reduce number of elements being restored
- Increase timeout in settings page methods
- Check network issues preventing API calls

## Migration Guide

If adding cleanup to an existing test:

```typescript
// Before
test('my test', async ({ settingsPage }) => {
  await settingsPage.changeTheme('dark');
});

// After
test.describe('My tests', () => {
  let snapshot: SettingsSnapshot;

  test.beforeEach(async ({ settingsPage }) => {
    snapshot = await settingsPage.captureCurrentSettings();
  });

  test.afterEach(async ({ settingsPage }) => {
    await settingsPage.restoreFromSnapshot(snapshot);
  });

  test('my test', async ({ settingsPage }) => {
    await settingsPage.changeTheme('dark');
  });
});
```

## Files Modified

### Test Files

- `/apps/desktop/e2e/settings.spec.ts` - Added cleanup hooks
- `/apps/desktop/e2e/agi.spec.ts` - Added cleanup hooks (AGI settings)
- `/apps/desktop/playwright/provider-switching.spec.ts` - Added cleanup hooks

### Support Files

- `/apps/desktop/e2e/page-objects/SettingsPage.ts` - Added capture/restore methods
- `/apps/desktop/e2e/utils/settings-cleanup.ts` - New cleanup utility

### Documentation

- This file - Cleanup and isolation guide

## References

- [Playwright Testing Best Practices](https://playwright.dev/docs/testing-best-practices)
- [Test Isolation Documentation](https://playwright.dev/docs/test-intro)
- [Fixtures for Setup/Teardown](https://playwright.dev/docs/test-fixtures)

## Questions?

For questions about test cleanup patterns, refer to:

1. This guide
2. Example implementations in settings.spec.ts
3. SettingsPage implementation for method documentation
4. CLAUDE.md for overall testing strategy
