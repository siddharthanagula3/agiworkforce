# E2E Testing Guide

Complete guide for running and writing E2E tests using the page objects.

## Setup

The Playwright configuration is already set up in `playwright.config.ts`:

```typescript
{
  testDir: './e2e/tests',
  fullyParallel: false,
  workers: 1,
  baseURL: 'http://localhost:3000',
  timeout: 120 * 1000,
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI
  }
}
```

## Running Tests

### Run all E2E tests

```bash
cd apps/web
pnpm exec playwright test
```

### Run specific test file

```bash
cd apps/web
pnpm exec playwright test e2e/example.test.ts
```

### Run tests in headed mode (see browser)

```bash
cd apps/web
pnpm exec playwright test --headed
```

### Run tests in debug mode

```bash
cd apps/web
pnpm exec playwright test --debug
```

### Run tests with UI mode (interactive)

```bash
cd apps/web
pnpm exec playwright test --ui
```

### Run tests for specific browser

```bash
cd apps/web
pnpm exec playwright test --project=chromium
```

### Generate test report

```bash
cd apps/web
pnpm exec playwright test && pnpm exec playwright show-report
```

## Writing Tests with Page Objects

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { SignupPage, PricingPage, DashboardPage } from './page-objects';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    // 1. Create page object instances
    const signupPage = new SignupPage(page);

    // 2. Navigate
    await signupPage.goto();

    // 3. Interact
    await signupPage.fillEmail('test@example.com');

    // 4. Assert
    expect(await signupPage.hasErrorMessage()).toBeFalsy();
  });
});
```

### Common Test Patterns

#### Testing Form Submission

```typescript
test('form submission success', async ({ page }) => {
  const signupPage = new SignupPage(page);

  await signupPage.goto();
  await signupPage.fillSignupForm('user@example.com', 'StrongPassword123!', 'John Doe');
  await signupPage.submitSignup();

  expect(await signupPage.isSignupSuccessful()).toBeTruthy();
});
```

#### Testing Navigation

```typescript
test('navigation between pages', async ({ page }) => {
  const pricingPage = new PricingPage(page);
  const dashboardPage = new DashboardPage(page);

  await pricingPage.goto();
  expect(page.url()).toContain('/pricing');

  await dashboardPage.goto();
  expect(page.url()).toContain('/dashboard');
});
```

#### Testing User Workflows

```typescript
test('complete pricing selection flow', async ({ page }) => {
  const pricingPage = new PricingPage(page);

  // User goes to pricing
  await pricingPage.goto();

  // Views available plans
  expect(await pricingPage.isPlanCardVisible('pro')).toBeTruthy();

  // Toggles billing interval
  await pricingPage.toggleBillingInterval('monthly');

  // Gets updated price
  const price = await pricingPage.getPlanPrice('pro');
  expect(price).toContain('29.99');

  // Selects plan
  await pricingPage.selectProPlan();
});
```

#### Testing Error States

```typescript
test('error handling', async ({ page }) => {
  const signupPage = new SignupPage(page);

  await signupPage.goto();
  await signupPage.fillEmail('invalid-email');

  // Browser validation prevents submission
  expect(await signupPage.isSubmitButtonDisabled()).toBeTruthy();
});
```

#### Testing Conditional UI

```typescript
test('plan selection shows different UI', async ({ page }) => {
  const pricingPage = new PricingPage(page);

  await pricingPage.goto();

  // Unauthenticated user sees subscribe buttons
  expect(await pricingPage.isPlanButtonDisabled('hobby')).toBeFalsy();

  // Can click subscribe (would need to handle auth)
  // await pricingPage.selectHobbyPlan();
});
```

## Page Object Best Practices

### 1. Keep Actions Simple

```typescript
// Good - single responsibility
async fillEmail(email: string): Promise<void> {
  await this.fill(this.emailInput, email);
}

// Avoid - mixing multiple actions
async fillAndValidateEmail(email: string): Promise<void> {
  await this.fill(this.emailInput, email);
  await this.page.waitForTimeout(1000); // bad practice
  const error = await this.getErrorMessage();
}
```

### 2. Use Meaningful Selectors

```typescript
// Good - specific and stable
private readonly emailInput = 'input[placeholder="Email address"]';

// Avoid - fragile selectors
private readonly emailInput = 'input:nth-of-type(2)';
```

### 3. Chain Related Methods

```typescript
// Good - logical grouping
await signupPage.fillSignupForm(email, password, name);

// Avoid - repetitive calls
await signupPage.fillEmail(email);
await signupPage.fillPassword(password);
await signupPage.fillFullName(name);
```

### 4. Handle Waits Appropriately

```typescript
// Good - wait for specific element
await this.waitForVisible(selector);
await this.click(selector);

// Avoid - arbitrary waits
await this.page.waitForTimeout(1000);
await this.click(selector);
```

## Testing Stripe Integration

The `StripePage` class handles Stripe checkout:

```typescript
test('stripe payment flow', async ({ page }) => {
  const stripePage = new StripePage(page);

  // Wait for checkout page
  await stripePage.waitForCheckoutPage();

  // Fill billing details
  await stripePage.fillBillingDetails('user@example.com', 'John Doe', '12345');

  // Fill test card
  await stripePage.fillTestCard();

  // Submit payment
  await stripePage.submitPayment();

  // Wait for success
  await stripePage.waitForPaymentSuccess();

  // Verify redirect
  expect(await stripePage.isRedirectedToDashboard()).toBeTruthy();
});
```

**Test Card Details:**

- Number: 4242 4242 4242 4242
- Expiry: 12/25
- CVC: 123
- Postal Code: Any 5 digits

## Debugging Tests

### Use Debug Mode

```bash
pnpm exec playwright test --debug
```

### Add Debug Statements

```typescript
test('debug example', async ({ page }) => {
  const pricingPage = new PricingPage(page);

  await pricingPage.goto();

  // Add breakpoint
  await page.pause();

  const planTier = await pricingPage.getCurrentPlanTier();
  console.log('Current plan tier:', planTier);
});
```

### Inspect Selectors

```typescript
test('inspect elements', async ({ page }) => {
  const pricingPage = new PricingPage(page);

  await pricingPage.goto();

  // Use Playwright Inspector
  await pricingPage.page.pause();

  // Or check element existence
  const exists = await pricingPage.exists('button:has-text("Subscribe")');
  console.log('Subscribe button exists:', exists);
});
```

### Capture Screenshots

```typescript
test('screenshot on failure', async ({ page }) => {
  const pricingPage = new PricingPage(page);

  try {
    await pricingPage.goto();
    // ... test code
  } catch (error) {
    await page.screenshot({ path: 'failure.png' });
    throw error;
  }
});
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm build
      - run: cd apps/web && pnpm exec playwright test

      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: apps/web/playwright-report/
```

## Troubleshooting

### Tests Timeout

- Check if dev server is running
- Increase timeout in test: `test.setTimeout(180 * 1000)`
- Check for missing waits

### Selectors Not Found

- Use `--headed` mode to see UI
- Check selector in browser DevTools
- Use `page.pause()` to debug
- Consider adding data-testid attributes

### Flaky Tests

- Add proper waits before assertions
- Use `waitForURL()` instead of hardcoded waits
- Ensure selectors are stable
- Consider test isolation issues

### Element Not Clickable

- Check if element is visible: `await page.isVisible(selector)`
- Wait for visibility: `await page.waitForSelector(selector)`
- Scroll into view: `await page.locator(selector).scrollIntoViewIfNeeded()`

## Performance Tips

1. **Reuse browser context** across tests when possible
2. **Use `reuseExistingServer`** in dev mode to skip rebuild
3. **Run tests in parallel** (adjust if needed for reliability)
4. **Mock external APIs** to speed up tests
5. **Use test data factories** for consistent test setup

## Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Page Object Model](https://playwright.dev/docs/pom)
- [Test Configuration](https://playwright.dev/docs/test-configuration)
