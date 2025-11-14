# E2E Test Suite

Comprehensive end-to-end testing for the AGI Workforce desktop application using Playwright.

## Quick Start

```powershell
# Run all E2E tests
pnpm test:e2e

# Run specific test project
pnpm exec playwright test --project=chat

# Run with UI mode
pnpm test:e2e:ui

# Run smoke tests only
pnpm test:smoke
```

## Directory Structure

```
e2e/
├── fixtures/
│   └── index.ts                 # Custom Playwright fixtures
├── page-objects/
│   ├── BasePage.ts              # Base page class
│   ├── ChatPage.ts              # Chat interface
│   ├── AutomationPage.ts        # Automation controls
│   ├── AGIPage.ts               # AGI workspace
│   ├── SettingsPage.ts          # Settings page
│   └── OnboardingPage.ts        # Onboarding wizard
├── utils/
│   ├── mock-llm-provider.ts     # Mock LLM responses
│   ├── test-database.ts         # Test DB management
│   ├── screenshot-helper.ts     # Screenshot utilities
│   └── wait-helper.ts           # Waiting strategies
├── integration/
│   └── rust-backend.spec.ts     # Backend integration tests
├── smoke.spec.ts                # Smoke tests
├── chat.spec.ts                 # Chat functionality
├── automation.spec.ts           # UI automation
├── agi.spec.ts                  # AGI system
├── onboarding.spec.ts           # Onboarding flow
├── settings.spec.ts             # Settings & config
└── visual-regression.spec.ts    # Visual regression

playwright/
├── goal-to-completion.spec.ts   # Goal lifecycle
├── file-operations.spec.ts      # File tools
├── browser-automation.spec.ts   # Browser tools
├── multi-tool-workflow.spec.ts  # Complex workflows
└── provider-switching.spec.ts   # LLM providers
```

## Test Categories

### 1. Smoke Tests (2 tests)

Basic app launch and navigation verification.

### 2. Chat Interface (11 tests)

- Message sending and receiving
- Conversation management
- Streaming responses
- AGI integration

### 3. Automation (17 tests)

- Window management
- UI element interaction
- Recording and replay
- Screenshot and OCR

### 4. AGI System (20 tests)

- Goal submission and tracking
- Step execution
- Resource monitoring
- Knowledge base

### 5. Onboarding (8 tests)

- Wizard navigation
- API key configuration
- Provider selection
- Preference saving

### 6. Settings (14 tests)

- Theme switching
- Resource limits
- Autonomous mode
- Import/export

### 7. Multi-LLM Router (10 tests)

- Provider switching
- Fallback logic
- Cost tracking
- Token usage

### 8. File Operations (10 tests)

- Read/write files
- Directory management
- Permission handling
- File watching

### 9. Browser Automation (10 tests)

- Navigation
- Form filling
- Data extraction
- Multi-step workflows

### 10. Multi-Tool Workflows (10 tests)

- Complex workflows
- Tool dependencies
- Parallel execution
- Result aggregation

### 11. Goal-to-Completion (10 tests)

- Full goal lifecycle
- Progress tracking
- Error handling
- State persistence

### 12. Visual Regression (10 tests)

- UI consistency
- Theme variations
- Responsive layouts
- Error states

### 13. Integration Tests (11 tests)

- Tauri commands
- Backend operations
- Event handling
- Concurrent calls

**Total: 157 tests across 14 spec files** (25 total files including fixtures, utilities, and page objects)

## Page Object Models

Page Objects encapsulate UI interactions and provide a clean API for tests.

### Example Usage

```typescript
import { test, expect } from './fixtures';

test('example test', async ({ chatPage }) => {
  // Navigate to chat
  await chatPage.goto();

  // Send a message
  await chatPage.sendMessage('Hello');

  // Wait for response
  await chatPage.waitForResponse();

  // Verify message count
  const count = await chatPage.getMessageCount();
  expect(count).toBeGreaterThan(1);
});
```

## Fixtures

Custom fixtures provide dependency injection for tests:

- `chatPage` - Chat interface interactions
- `automationPage` - Automation workflows
- `agiPage` - AGI goal management
- `settingsPage` - Settings configuration
- `onboardingPage` - Onboarding wizard
- `testDb` - Test database with seeding
- `mockLLM` - Mock LLM provider
- `screenshot` - Screenshot utilities
- `waitHelper` - Advanced waiting strategies

## Mock LLM Provider

Tests use a mock LLM provider for deterministic, fast execution:

```typescript
test('example', async ({ mockLLM }) => {
  // Set up custom response
  mockLLM.setMockResponse(/create.*component/i, 'I will create the component with these steps...');

  // Test proceeds with mock responses
});
```

## Test Database

Tests use an isolated database with seed data:

```typescript
test('example', async ({ testDb }) => {
  // Database is automatically initialized with:
  // - Sample conversations
  // - Sample goals
  // - Default settings

  // Add custom data if needed
  await testDb.insertGoal({ ... });

  // Cleanup happens automatically
});
```

## Visual Regression

Visual tests capture screenshots for comparison:

```typescript
test('visual check', async ({ screenshot }) => {
  // Capture full page
  await screenshot.captureFullPage('homepage');

  // Capture specific element
  await screenshot.captureElement('.modal', 'dialog');

  // Create baseline for first run
  await screenshot.createBaseline('feature-page');
});
```

## CI/CD Integration

Tests run automatically via GitHub Actions:

- **Triggers:** Push to main/develop, pull requests
- **Platform:** Windows (primary target)
- **Retries:** 2 attempts in CI
- **Artifacts:** Reports, screenshots, metrics
- **Notifications:** On failure (main branch)

See `.github/workflows/e2e-tests.yml` for full configuration.

## Test Reports

After execution, reports are available:

- **HTML Report:** `playwright-report/index.html`
- **JSON Results:** `playwright-report/results.json`
- **JUnit XML:** `playwright-report/junit.xml`
- **Screenshots:** `e2e/screenshots/`

View HTML report:

```powershell
pnpm exec playwright show-report
```

## Writing Tests

### Best Practices

#### 1. **Use Page Objects** - Encapsulate UI Logic

Page Objects isolate UI interaction details, making tests more maintainable:

```typescript
// Page Object manages UI interaction
class ChatPage {
  async sendMessage(text: string) {
    await this.page.fill('[data-testid="message-input"]', text);
    await this.page.click('[data-testid="send-button"]');
  }
}

// Test focuses on behavior, not implementation
test('user can send message', async ({ chatPage }) => {
  await chatPage.sendMessage('Hello');
});
```

#### 2. **Use Fixtures** - Leverage Dependency Injection

Fixtures provide pre-configured dependencies with proper setup/teardown:

```typescript
test('example', async ({ chatPage, mockLLM, waitHelper }) => {
  // All fixtures are initialized and ready to use
  // Cleanup happens automatically
});
```

#### 3. **Independent Tests** - No Inter-Test Dependencies

Each test must run in isolation:

```typescript
// Good: Tests are independent
test('create conversation', async ({ chatPage }) => {
  await chatPage.createNew();
  const count = await chatPage.getConversationCount();
  expect(count).toBeGreaterThan(0);
});

test('send message', async ({ chatPage }) => {
  await chatPage.sendMessage('Hi');
  // Works even if run before "create conversation"
});

// Avoid: Test depends on previous test running first
test.skip('delete conversation', async ({ chatPage }) => {
  // This should not depend on previous test
});
```

#### 4. **Descriptive Names** - Clear Test Intent

Test names should describe what is being tested, not how:

```typescript
// Good: Describes intent
test('should display error message when API fails', async () => {});
test('should auto-save settings after 2 seconds of inactivity', async () => {});

// Avoid: Too vague or implementation-focused
test('test error handling', async () => {});
test('test settings save', async () => {});
```

#### 5. **AAA Pattern** - Arrange, Act, Assert

Structure tests with clear sections:

```typescript
test('should increment counter', async ({ page }) => {
  // Arrange: Set up initial state
  await page.goto('/counter');
  const initialValue = await page.textContent('[data-testid="count"]');

  // Act: Perform the action
  await page.click('[data-testid="increment"]');

  // Assert: Verify the result
  const newValue = await page.textContent('[data-testid="count"]');
  expect(parseInt(newValue)).toBe(parseInt(initialValue) + 1);
});
```

#### 6. **Meaningful Assertions** - Test Actual Behavior

Assert on user-visible outcomes, not implementation details:

```typescript
// Good: Tests user-visible behavior
test('message appears in chat', async ({ chatPage }) => {
  await chatPage.sendMessage('Hello');
  await chatPage.waitForMessageVisible('Hello');
  const message = await chatPage.getLastMessage();
  expect(message).toContain('Hello');
});

// Avoid: Testing implementation details
test('mockLLM called with correct args', async ({ mockLLM }) => {
  // Too focused on implementation
});
```

#### 7. **Handle Async Operations** - Use Wait Helpers

Always wait for async operations to complete:

```typescript
// Good: Explicitly wait for operations
test('should display response', async ({ chatPage, waitHelper }) => {
  await chatPage.sendMessage('Hello');
  await waitHelper.waitForCondition(
    async () => {
      return await chatPage.responseExists();
    },
    { timeout: 5000 },
  );
  expect(await chatPage.getResponse()).toBeTruthy();
});

// Avoid: Hope async completes in time
test.skip('should display response', async ({ chatPage }) => {
  await chatPage.sendMessage('Hello');
  // No wait - test might fail randomly
  const response = await chatPage.getResponse();
});
```

#### 8. **Use Mock Data** - Deterministic Testing

Leverage fixtures to inject consistent test data:

```typescript
test('should load conversations', async ({ chatPage, testDb }) => {
  // testDb has seed data - deterministic and fast
  await chatPage.goto();
  const conversations = await chatPage.listConversations();
  expect(conversations.length).toBeGreaterThan(0);
});
```

#### 9. **Avoid Timeouts** - Use Smart Waiting

Use smart waiting instead of fixed delays:

```typescript
// Good: Waits for specific condition
await waitHelper.waitForSelector('[data-testid="response"]');

// Avoid: Arbitrary fixed delay
await page.waitForTimeout(5000);
```

### Example Test Structure

```typescript
import { test, expect } from './fixtures';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup
    await page.goto('http://localhost:1420');
  });

  test('should do something specific', async ({ chatPage, mockLLM }) => {
    // Arrange
    mockLLM.setMockResponse(/pattern/i, 'response');

    // Act
    await chatPage.sendMessage('test');

    // Assert
    const count = await chatPage.getMessageCount();
    expect(count).toBeGreaterThan(0);
  });
});
```

## Debugging Tests

### Run in UI Mode

```powershell
pnpm exec playwright test --ui
```

### Run in Debug Mode

```powershell
pnpm exec playwright test --debug
```

### View Trace

```powershell
pnpm exec playwright show-trace trace.zip
```

### Slow Motion

```powershell
pnpm exec playwright test --slow-mo=1000
```

## Configuration

Test configuration is in `playwright.config.ts`:

- **Workers:** 1 (Tauri limitation)
- **Retries:** 2 in CI, 0 locally
- **Timeout:** 30min CI, 60min local
- **Screenshots:** On failure
- **Video:** On failure
- **Trace:** On first retry

### baseURL Configuration

The test suite uses a centralized `baseURL` setting to simplify test code:

```typescript
// In playwright.config.ts
use: {
  baseURL: 'http://localhost:1420',
  // ... other settings
}
```

**Using baseURL in Tests:**

Instead of hardcoding full URLs, use relative paths with the fixture's `page` object:

```typescript
// Good: Uses baseURL automatically
await page.goto('/');
await page.goto('/chat');
await page.goto('/automation');

// Avoid: Hardcoded full URLs
await page.goto('http://localhost:1420/');
```

**Benefits:**

- ✅ Simplified test code - shorter, more readable
- ✅ Easy switching between environments - just update baseURL
- ✅ Works seamlessly with Playwright fixtures
- ✅ Consistent across all tests without repetition

**Page Object Integration:**

Page Objects can leverage baseURL for clean navigation:

```typescript
class ChatPage {
  async goto() {
    // Page context has baseURL configured
    await this.page.goto('/');
    // Automatically navigates to http://localhost:1420/
  }

  async openConversations() {
    // Relative paths work throughout
    await this.page.goto('/?tab=conversations');
  }
}
```

## Known Limitations

1. **Sequential Execution** - Tauri apps can't run in parallel
2. **Windows Only** - Primary platform is Windows
3. **Startup Time** - Tauri app can be slow to start
4. **Mock LLM** - Tests don't call real LLM APIs

## Performance

**Estimated Execution Time:** ~25 minutes for full suite

- Smoke: 10s
- Chat: 2.8min
- Automation: 2.8min
- AGI: 4min
- Onboarding: 1.1min
- Settings: 1.6min
- Others: ~11min

## Troubleshooting

### App Won't Start

**Symptoms:** Tests fail immediately with "Cannot find browser" or connection errors

**Solutions:**

1. Verify dev server is running:

```powershell
pnpm --filter @agiworkforce/desktop dev
```

2. Check that Tauri dev server is accessible:

```powershell
# In another terminal
curl http://localhost:1420
```

3. Ensure Node.js version is correct:

```powershell
node --version  # Should be v20.x or v22.x
nvm use         # Reads from .nvmrc
```

4. Clear Tauri cache if startup fails:

```powershell
cd apps/desktop/src-tauri
cargo clean
cd ../..
pnpm --filter @agiworkforce/desktop dev
```

### Tests Timeout

**Symptoms:** Tests fail with "Timeout 30000ms exceeded"

**Causes and Solutions:**

1. **Slow Startup:** Tauri app takes >30s to launch
   - Increase global timeout in `playwright.config.ts`:

   ```typescript
   globalTimeout: 60 * 60 * 1000, // 60 minutes for local
   ```

2. **Slow Network:** LLM API calls or network operations timing out
   - Increase test-specific timeout:

   ```typescript
   test('slow operation', async ({ page }) => {
     test.setTimeout(60000); // 60 seconds for this test
     // ... test code
   });
   ```

3. **UI Rendering:** Complex UI takes time to render
   - Use smart waiting instead of fixed delays:

   ```typescript
   // Good: Wait for element
   await page.waitForSelector('[data-testid="response"]', { timeout: 10000 });

   // Avoid: Arbitrary delay
   await page.waitForTimeout(5000);
   ```

### Flaky Tests

**Symptoms:** Same test passes sometimes, fails other times

**Causes and Solutions:**

1. **Race Conditions:** Not waiting for async operations

   ```typescript
   // Good: Explicit wait
   await waitHelper.waitForCondition(
     async () => {
       return await someCheck();
     },
     { timeout: 10000 },
   );

   // Avoid: No wait
   const result = await someAsyncCheck(); // Might fail
   ```

2. **Element Not Ready:** Clicking/typing before element is interactive

   ```typescript
   // Good: Ensure element is ready
   await page.locator('[data-testid="button"]').isEnabled();
   await page.click('[data-testid="button"]');

   // Avoid: Immediate interaction
   await page.click('[data-testid="button"]');
   ```

3. **Timing-Dependent Assertions:**

   ```typescript
   // Good: Poll until condition is true
   await expect(page.locator('[data-testid="count"]')).toContainText('5', {
     timeout: 5000,
   });

   // Avoid: Single check at specific time
   const count = await page.textContent('[data-testid="count"]');
   ```

4. **Mock Data Inconsistency:**
   - Ensure mock data is reset between tests
   - Use testDb fixture which auto-resets

### Visual Diffs

**Symptoms:** Visual regression tests fail with unexpected diffs

**Solutions:**

1. **First Run - Create Baseline:**

```powershell
pnpm exec playwright test visual-regression --update-snapshots
```

2. **Intentional Changes - Update Baseline:**

```powershell
# After UI changes, update expected screenshots
pnpm exec playwright test visual-regression --update-snapshots

# Then commit the updated baselines
git add e2e/screenshots/
git commit -m "chore: update visual regression baselines"
```

3. **Unexpected Diffs - Debug:**

```powershell
# Run specific test and see diff
pnpm exec playwright test visual-regression --headed

# Or view the HTML report
pnpm exec playwright show-report
```

4. **Cross-Browser Differences:**
   - Visual diffs between Chrome/Firefox are normal
   - Use project-specific baselines if needed

### Browser Window Issues

**Symptoms:** Tests fail because window doesn't open or is wrong size

**Solutions:**

1. **Check Window Configuration:**
   - Config sets viewport to 1920x1080
   - Some CI environments have smaller screens
   - Adjust in `playwright.config.ts`:

   ```typescript
   use: {
     viewport: { width: 1280, height: 720 }, // Smaller for CI
   }
   ```

2. **Window Management in Tests:**

   ```typescript
   // Good: Don't assume window state
   await page.setViewportSize({ width: 1920, height: 1080 });

   // Avoid: Assuming preset viewport
   ```

### Page Navigation Issues

**Symptoms:** `page.goto()` hangs or timeouts

**Solutions:**

1. **Use baseURL for Navigation:**

   ```typescript
   // Good: Uses baseURL automatically
   await page.goto('/');
   await page.goto('/chat');

   // Avoid: Full URL when baseURL is configured
   await page.goto('http://localhost:1420/');
   ```

2. **Check App is Running:**

   ```powershell
   curl http://localhost:1420
   ```

3. **Wait for Network:**

   ```typescript
   // Good: Wait for network idle
   await page.goto('/', { waitUntil: 'networkidle' });

   // Or use custom wait
   await waitHelper.waitForNetworkIdle();
   ```

### Getting Debug Information

**Enable Verbose Logging:**

```powershell
# Show all Playwright debug info
$env:DEBUG = "pw:api"
pnpm exec playwright test

# Show Rust backend logs
$env:RUST_LOG = "debug"
pnpm --filter @agiworkforce/desktop dev
```

**Capture Debug Artifacts:**

```powershell
# Tests with trace for detailed inspection
pnpm exec playwright test --trace on

# View trace
pnpm exec playwright show-trace trace.zip

# Generate full test report with screenshots
pnpm exec playwright show-report
```

### Common Error Messages

| Error                                             | Cause                                 | Solution                                   |
| ------------------------------------------------- | ------------------------------------- | ------------------------------------------ |
| `Timeout 30000ms exceeded`                        | Test took too long                    | Increase timeout or optimize test          |
| `Target page, context or browser has been closed` | Page closed unexpectedly              | Check for errors in console logs           |
| `Cannot find element`                             | Element selector is wrong/not visible | Update selector or add waits               |
| `Browser process exited unexpectedly`             | Browser crashed                       | Run with `--no-sandbox` or increase memory |
| `Connection refused`                              | Dev server not running                | Start with `pnpm dev`                      |

## Contributing

1. Write tests following Page Object Model pattern
2. Use fixtures for dependencies
3. Add meaningful test descriptions
4. Ensure tests are independent
5. Update this README if adding new categories

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Tauri Testing Guide](https://tauri.app/v1/guides/testing/)
- [Page Object Model](https://playwright.dev/docs/pom)
- [Test Fixtures](https://playwright.dev/docs/test-fixtures)

---

**For detailed test report, see:** `E2E_TEST_REPORT.md`
