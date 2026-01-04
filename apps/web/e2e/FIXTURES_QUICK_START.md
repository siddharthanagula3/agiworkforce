# Playwright Fixtures Quick Start

## Import

```typescript
import { test, expect } from '../fixtures';
```

## Basic Test

```typescript
test('my test', async ({ page, signupPage, testDb, testUser }) => {
  await signupPage.goto();
  await signupPage.fillSignupForm(testUser.email, testUser.password, 'Test User');
  await signupPage.submitSignup();

  testUser.userId = await testDb.getUserByEmail(testUser.email);
  expect(testUser.userId).toBeTruthy();
});
```

## Available Fixtures

| Fixture         | Type                          | Purpose                      | Auto-Cleanup      |
| --------------- | ----------------------------- | ---------------------------- | ----------------- |
| `signupPage`    | `SignupPage`                  | Signup form interactions     | No                |
| `pricingPage`   | `PricingPage`                 | Pricing page interactions    | No                |
| `dashboardPage` | `DashboardPage`               | Dashboard interactions       | No                |
| `stripePage`    | `StripePage`                  | Stripe checkout interactions | No                |
| `testDb`        | `TestDatabase`                | Database helpers             | Yes (disconnect)  |
| `stripeHelpers` | `StripeHelpers`               | Stripe test helpers          | No                |
| `testUser`      | `{ email, password, userId }` | Test credentials             | Yes (delete user) |

## Key Patterns

### Use testUser

```typescript
await signupPage.fillSignupForm(
  testUser.email, // test-{timestamp}@example.com
  testUser.password, // Test1234!@#$
  'Display Name',
);
```

### Store userId

```typescript
testUser.userId = await testDb.getUserByEmail(testUser.email);
// Auto-cleanup deletes user after test
```

### Wait for Subscription

```typescript
const subscription = await testDb.waitForSubscription(
  testUser.userId,
  30000, // 30 second timeout
);
expect(subscription.plan_tier).toBe('hobby');
```

### Get Stripe Test Card

```typescript
const card = stripeHelpers.getTestCardDetails();
// Returns: { number: '4242...', exp_month: 12, ... }
```

## Common Scenarios

### Signup Flow

```typescript
test('signup', async ({ signupPage, testDb, testUser }) => {
  await signupPage.goto();
  await signupPage.fillSignupForm(testUser.email, testUser.password, 'User');
  await signupPage.submitSignup();

  testUser.userId = await testDb.getUserByEmail(testUser.email);
});
```

### Signup + Checkout

```typescript
test('signup and checkout', async ({ signupPage, pricingPage, stripePage, testDb, testUser }) => {
  // Signup
  await signupPage.goto();
  await signupPage.fillSignupForm(testUser.email, testUser.password, 'User');
  await signupPage.submitSignup();

  testUser.userId = await testDb.getUserByEmail(testUser.email);

  // Pricing
  await pricingPage.goto();
  await pricingPage.selectPlan('hobby');

  // Stripe
  await stripePage.waitForCheckoutPage();
  await stripePage.fillTestCard();
  await stripePage.submitPayment();
});
```

### Database Verification

```typescript
test('user in database', async ({ testDb, testUser }) => {
  const user = await testDb.createTestUser(testUser.email, testUser.password);
  testUser.userId = user.id;

  const profile = await testDb.getProfile(user.id);
  expect(profile?.email).toBe(testUser.email);
});
```

## Fixture Cleanup

Automatic cleanup happens in this order:

1. `testUser` cleanup: Deletes user if `userId` is set
2. `testDb` cleanup: Calls `disconnect()`

Manual cleanup (if needed):

```typescript
await testDb.deleteTestUser(userId);
await testDb.disconnect();
```

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_test_...
```

## Run Tests

```bash
# All tests
pnpm test:e2e

# Specific file
pnpm test:e2e tests/fixtures-example.test.ts

# Specific test
pnpm test:e2e -t "signup"

# With UI
pnpm test:e2e:ui

# Debug mode
PWDEBUG=1 pnpm test:e2e
```

## Important

1. Always set `testUser.userId` after creating user for auto-cleanup
2. Import from `../fixtures` not `@playwright/test`
3. Use unique email from `testUser.email` (auto-generated)
4. Specify timeout for `waitForSubscription()`: 30000 (30 seconds)

## Documentation

- Full guide: `apps/web/e2e/FIXTURES_SETUP.md`
- Examples: `apps/web/e2e/tests/fixtures-example.test.ts`
- Summary: `FIXTURES_CREATION_SUMMARY.md`
