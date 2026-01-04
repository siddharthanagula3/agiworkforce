# Page Objects Quick Reference

## Quick Import

```typescript
import { SignupPage, PricingPage, DashboardPage, StripePage } from './page-objects';
```

## Quick Test Template

```typescript
import { test, expect } from '@playwright/test';
import { SignupPage } from './page-objects';

test('user can sign up', async ({ page }) => {
  const signup = new SignupPage(page);

  await signup.goto();
  await signup.fillSignupForm('user@example.com', 'Pass123!', 'John Doe');
  await signup.submitSignup();

  expect(await signup.isSignupSuccessful()).toBeTruthy();
});
```

## BasePage Methods

| Method                 | Purpose          |
| ---------------------- | ---------------- |
| `goto(path)`           | Navigate to path |
| `click(selector)`      | Click element    |
| `fill(selector, text)` | Fill input       |
| `getText(selector)`    | Get text         |
| `isVisible(selector)`  | Check visibility |
| `isDisabled(selector)` | Check disabled   |
| `getValue(selector)`   | Get input value  |
| `clear(selector)`      | Clear input      |
| `exists(selector)`     | Check existence  |
| `waitForURL(pattern)`  | Wait for URL     |

## SignupPage Methods

| Method                             | Purpose           |
| ---------------------------------- | ----------------- |
| `goto()`                           | Go to signup page |
| `fillSignupForm(email, pwd, name)` | Fill entire form  |
| `fillEmail(email)`                 | Fill email        |
| `fillPassword(password)`           | Fill password     |
| `fillConfirmPassword(password)`    | Fill confirm pwd  |
| `submitSignup()`                   | Submit form       |
| `getErrorMessage()`                | Get error text    |
| `hasErrorMessage()`                | Check for error   |
| `isSignupSuccessful()`             | Check success     |

## PricingPage Methods

| Method                            | Purpose                     |
| --------------------------------- | --------------------------- |
| `goto()`                          | Go to pricing page          |
| `selectPlan(tier)`                | Select plan (hobby/pro/max) |
| `toggleBillingInterval(interval)` | Toggle monthly/annual       |
| `getPlanPrice(tier)`              | Get plan price              |
| `getCurrentPlanBadge()`           | Get current plan text       |
| `hasManageButton()`               | Check manage visible        |
| `isLaunchOfferBadgeVisible()`     | Check badge visible         |

## DashboardPage Methods

| Method                   | Purpose            |
| ------------------------ | ------------------ |
| `goto()`                 | Go to dashboard    |
| `waitForLoad()`          | Wait for load      |
| `getCurrentPlanTier()`   | Get plan tier      |
| `isSubscriptionActive()` | Check subscription |
| `isFreeTier()`           | Check free tier    |
| `getApiUsageCount()`     | Get API usage      |
| `getTeamMembersCount()`  | Get team count     |

## StripePage Methods

| Method                                 | Purpose           |
| -------------------------------------- | ----------------- |
| `waitForCheckoutPage()`                | Wait for checkout |
| `fillEmail(email)`                     | Fill email        |
| `fillBillingDetails(email, name, zip)` | Fill billing      |
| `fillTestCard()`                       | Fill test card    |
| `submitPayment()`                      | Submit payment    |
| `hasError()`                           | Check error       |
| `waitForPaymentSuccess()`              | Wait success      |

## Stripe Test Card

```
Number: 4242 4242 4242 4242
Expiry: 12/25
CVC: 123
```

## Run Tests

```bash
# All tests
pnpm exec playwright test

# Headed mode
pnpm exec playwright test --headed

# Debug mode
pnpm exec playwright test --debug

# UI mode
pnpm exec playwright test --ui

# Specific file
pnpm exec playwright test example.test.ts

# Show report
pnpm exec playwright show-report
```

## Common Patterns

### Form Submission

```typescript
await page.fillSignupForm(email, password, name);
await page.submitSignup();
expect(await page.isSignupSuccessful()).toBeTruthy();
```

### Plan Selection

```typescript
await pricingPage.selectPlan('pro');
await pricingPage.toggleBillingInterval('monthly');
const price = await pricingPage.getPlanPrice('pro');
```

### Dashboard Check

```typescript
await dashboardPage.waitForLoad();
const tier = await dashboardPage.getCurrentPlanTier();
const active = await dashboardPage.isSubscriptionActive();
```

### Payment Flow

```typescript
await stripePage.waitForCheckoutPage();
await stripePage.fillBillingDetails('user@example.com');
await stripePage.fillTestCard();
await stripePage.submitPayment();
await stripePage.waitForPaymentSuccess();
```

## Debugging

| Command             | Purpose          |
| ------------------- | ---------------- |
| `page.pause()`      | Pause execution  |
| `page.screenshot()` | Take screenshot  |
| `page.url()`        | Get current URL  |
| `--headed`          | See browser      |
| `--debug`           | Step through     |
| `--ui`              | Interactive mode |

## File Locations

```
/apps/web/e2e/
├── page-objects/
│   ├── base-page.ts
│   ├── signup-page.ts
│   ├── pricing-page.ts
│   ├── dashboard-page.ts
│   ├── stripe-page.ts
│   └── index.ts
├── example.test.ts
├── TESTING_GUIDE.md
└── README.md
```

## Documentation

- **README.md** - Detailed docs
- **TESTING_GUIDE.md** - Testing guide
- **IMPLEMENTATION_SUMMARY.md** - Technical summary
- **QUICK_REFERENCE.md** - This file
