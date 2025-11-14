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

**Total: 153 tests across 25 files**

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
  mockLLM.setMockResponse(
    /create.*component/i,
    'I will create the component with these steps...'
  );

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

1. **Use Page Objects** - Encapsulate UI logic
2. **Use Fixtures** - Leverage dependency injection
3. **Independent Tests** - No test dependencies
4. **Descriptive Names** - Clear test intent
5. **AAA Pattern** - Arrange, Act, Assert
6. **Meaningful Assertions** - Test actual behavior

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

Check that the dev server is running:
```powershell
pnpm --filter @agiworkforce/desktop dev
```

### Tests Timeout

Increase timeout in `playwright.config.ts`:
```typescript
timeout: 60000, // 60 seconds
```

### Flaky Tests

Use wait helpers:
```typescript
await waitHelper.waitForCondition(async () => {
  return await someCheck();
}, { timeout: 10000 });
```

### Visual Diffs

Update baselines:
```powershell
pnpm exec playwright test visual-regression --update-snapshots
```

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
