# Playwright Custom Fixtures Setup

This document explains the custom Playwright fixtures available for E2E testing in the AGI Workforce web app.

## Overview

Custom fixtures are defined in `apps/web/e2e/fixtures/index.ts` and extend the base Playwright test with:

- **Page Objects**: Pre-instantiated page object classes for UI interactions
- **Database Helpers**: TestDatabase for Supabase integration testing
- **Stripe Helpers**: StripeHelpers for Stripe payment testing
- **Test User**: Auto-generated test user with cleanup

## Using Fixtures in Tests

### Import Fixtures

```typescript
import { test, expect } from '../fixtures';
```

Note: Always import from `../fixtures` (relative to your test file), not from `@playwright/test`.

### Basic Test Structure

```typescript
import { test, expect } from '../fixtures';

test('user can sign up', async ({ page, signupPage, testDb, testUser }) => {
  // page: Browser page object (from Playwright)
  // signupPage: SignupPage instance with helper methods
  // testDb: TestDatabase with Supabase helpers
  // testUser: { email, password, userId }
  // ... test code
});
```

## Available Fixtures

### 1. signupPage

**Type:** `SignupPage`

**Description:** Page object for signup page interactions.

**Key Methods:**

- `goto()` - Navigate to /signup
- `fillSignupForm(email, password, displayName)` - Fill all form fields
- `submitSignup()` - Click submit button
- `getErrorMessage()` - Get validation error text
- `isSubmitButtonDisabled()` - Check button state

**Example:**

```typescript
test('user can sign up', async ({ signupPage, testUser }) => {
  await signupPage.goto();
  await signupPage.fillSignupForm(testUser.email, testUser.password, 'John Doe');
  await signupPage.submitSignup();
});
```

### 2. pricingPage

**Type:** `PricingPage`

**Description:** Page object for pricing page interactions.

**Key Methods:**

- `goto()` - Navigate to /pricing
- `toggleBillingInterval(interval)` - Switch between 'monthly' and 'annual'
- `selectPlan(tier)` - Select a plan: 'hobby', 'pro', or 'max'
- `isPlanCardVisible(tier)` - Check if plan is visible
- `getPlanPrice(tier)` - Get plan price text

**Example:**

```typescript
test('user can select plan', async ({ pricingPage }) => {
  await pricingPage.goto();
  await pricingPage.toggleBillingInterval('monthly');
  await pricingPage.selectPlan('hobby');
});
```

### 3. dashboardPage

**Type:** `DashboardPage`

**Description:** Page object for dashboard interactions.

**Key Methods:**

- `goto()` - Navigate to /dashboard
- `waitForLoad()` - Wait for dashboard to fully render
- `getCurrentPlanTier()` - Get current plan tier
- `isSubscriptionActive()` - Check subscription status
- `clickManageBilling()` - Click billing management button

**Example:**

```typescript
test('dashboard shows subscription', async ({ dashboardPage }) => {
  await dashboardPage.goto();
  await dashboardPage.waitForLoad();

  const tier = await dashboardPage.getCurrentPlanTier();
  expect(tier).toBe('Hobby');

  const isActive = await dashboardPage.isSubscriptionActive();
  expect(isActive).toBe(true);
});
```

### 4. stripePage

**Type:** `StripePage`

**Description:** Page object for Stripe checkout page interactions.

**Key Methods:**

- `waitForCheckoutPage()` - Wait for Stripe checkout to load
- `fillTestCard()` - Fill Stripe test card
- `fillBillingDetails(email)` - Fill billing email
- `submitPayment()` - Submit payment
- `getErrorMessage()` - Get payment error

**Example:**

```typescript
test('user can complete stripe checkout', async ({ stripePage }) => {
  await stripePage.waitForCheckoutPage();
  await stripePage.fillTestCard();
  await stripePage.fillBillingDetails('user@example.com');
  await stripePage.submitPayment();
});
```

### 5. testDb

**Type:** `TestDatabase`

**Description:** Supabase database helper for test data management.

**Key Methods:**

- `connect()` - Initialize Supabase client (called automatically)
- `createTestUser(email, password)` - Create user in auth
- `deleteTestUser(userId)` - Delete user and related data
- `getUserByEmail(email)` - Get user ID by email
- `getSubscription(userId)` - Get subscription record
- `getProfile(userId)` - Get user profile
- `waitForSubscription(userId, timeout)` - Poll until subscription appears
- `cleanup()` - Cleanup all test data
- `disconnect()` - Close database connection (called automatically)

**Auto-Cleanup:** The fixture automatically calls `disconnect()` after the test.

**Example:**

```typescript
test('subscription created after checkout', async ({ testDb, testUser }) => {
  // Create test user
  const user = await testDb.createTestUser(testUser.email, testUser.password);
  testUser.userId = user.id;

  // ... perform checkout ...

  // Wait for subscription to be created
  const subscription = await testDb.waitForSubscription(
    user.id,
    30000, // 30 second timeout
  );

  expect(subscription.plan_tier).toBe('hobby');
  expect(subscription.status).toBe('active');
});
```

### 6. stripeHelpers

**Type:** `StripeHelpers`

**Description:** Stripe test helper for verification and cleanup.

**Key Methods:**

- `getTestCardDetails()` - Get test card object
- `getAlternateTestCard()` - Get alternate test card
- `getDeclineTestCard()` - Get declining test card
- `getCheckoutSession(sessionId)` - Retrieve checkout session
- `getSubscription(subscriptionId)` - Retrieve Stripe subscription
- `cancelTestSubscription(subscriptionId)` - Cancel subscription
- `createTestCustomer(email, name)` - Create test customer
- `deleteTestCustomer(customerId)` - Delete customer

**No Auto-Cleanup:** StripeHelpers is stateless and doesn't require cleanup.

**Example:**

```typescript
test('stripe customer created', async ({ stripeHelpers }) => {
  const customerId = await stripeHelpers.createTestCustomer('user@example.com', 'Test User');

  expect(customerId).toMatch(/^cus_/);

  const customer = await stripeHelpers.getCustomer(customerId);
  expect(customer.email).toBe('user@example.com');
});
```

### 7. testUser

**Type:** `{ email: string; password: string; userId: string | null }`

**Description:** Pre-generated test user credentials.

**Properties:**

- `email`: Unique email (format: `test-{timestamp}@example.com`)
- `password`: Default password: `Test1234!@#$`
- `userId`: Set after user creation in database (initially `null`)

**Auto-Cleanup:** The fixture automatically deletes the test user from the database after the test completes.

**Example:**

```typescript
test('complete signup flow', async ({ testUser, testDb, signupPage }) => {
  // Use pre-generated credentials
  await signupPage.goto();
  await signupPage.fillSignupForm(testUser.email, testUser.password, 'Test User');
  await signupPage.submitSignup();

  // Store userId for later use
  testUser.userId = await testDb.getUserByEmail(testUser.email);

  // Cleanup happens automatically after test
});
```

## Complete Example: Signup to Subscription

```typescript
import { test, expect } from '../fixtures';

test('complete signup and checkout flow', async ({
  page,
  signupPage,
  pricingPage,
  dashboardPage,
  stripePage,
  testDb,
  testUser,
}) => {
  // Step 1: Sign up
  await signupPage.goto();
  await signupPage.fillSignupForm(testUser.email, testUser.password, 'Test User');
  await signupPage.submitSignup();

  // Step 2: Verify redirect to dashboard
  await dashboardPage.waitForLoad();
  expect(page.url()).toContain('/dashboard');

  // Step 3: Get user ID
  testUser.userId = await testDb.getUserByEmail(testUser.email);
  expect(testUser.userId).toBeTruthy();

  // Step 4: Navigate to pricing
  await pricingPage.goto();

  // Step 5: Select plan
  await pricingPage.selectPlan('hobby');

  // Step 6: Complete Stripe checkout
  await stripePage.waitForCheckoutPage();
  await stripePage.fillTestCard();
  await stripePage.fillBillingDetails(testUser.email);
  await stripePage.submitPayment();

  // Step 7: Wait for redirect
  await page.waitForURL(/\/dashboard/);

  // Step 8: Verify subscription created
  const subscription = await testDb.waitForSubscription(testUser.userId, 30000);
  expect(subscription.plan_tier).toBe('hobby');
  expect(subscription.status).toBe('active');

  // Step 9: Verify dashboard
  const tier = await dashboardPage.getCurrentPlanTier();
  expect(tier).toBe('Hobby');
});
```

## Best Practices

### 1. Always Update testUser.userId

When creating a test user through the UI (signup flow), store the user ID:

```typescript
testUser.userId = await testDb.getUserByEmail(testUser.email);
```

This ensures automatic cleanup happens.

### 2. Use Timeout on Polling

When waiting for webhooks, always specify a timeout:

```typescript
const subscription = await testDb.waitForSubscription(
  userId,
  30000, // 30 seconds
);
```

### 3. Organize Test Groups

Use `test.describe()` to group related tests:

```typescript
test.describe('Signup Flow', () => {
  test('valid signup succeeds', async ({ signupPage }) => {
    // ...
  });

  test('duplicate email shows error', async ({ signupPage }) => {
    // ...
  });
});
```

### 4. Avoid Database State Dependencies

Each test should be independent. Use unique test users:

```typescript
// ✅ Good: Uses auto-generated unique email
const email = testUser.email; // test-{timestamp}@example.com

// ❌ Avoid: Hardcoded email can cause conflicts
const email = 'testuser@example.com';
```

## Environment Variables

Ensure these are set before running tests:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Running Tests

```bash
# Run all E2E tests
cd apps/web
pnpm test:e2e

# Run specific test file
pnpm test:e2e subscription.test.ts

# Run with UI
pnpm test:e2e:ui

# Run single test
pnpm test:e2e -t "complete signup"
```

## Debugging

### Enable Debug Mode

```bash
PWDEBUG=1 pnpm test:e2e
```

### Use Test UI

```bash
pnpm test:e2e:ui
```

### Check Fixture Lifecycle

Fixtures are executed in this order:

1. `testDb.connect()` - Initialize database
2. `testUser` initialization - Generate email, store userId
3. Test execution
4. `testUser` cleanup - Delete user if userId exists
5. `testDb.disconnect()` - Close database

## Troubleshooting

### "Database not connected" error

The `testDb` fixture calls `connect()` automatically. If you're manually instantiating TestDatabase outside the fixture, call `connect()`:

```typescript
// Outside fixture (not recommended)
const db = new TestDatabase();
await db.connect();
```

### "Supabase configuration missing" error

Ensure environment variables are set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Webhook timeout issues

Increase timeout or check:

1. Stripe CLI forwarding is running
2. Webhook secret is correct
3. Network connectivity to webhook endpoint

## Contributing

When adding new fixtures:

1. Define fixture type in `Fixtures` type
2. Implement fixture in `test.extend()` block
3. Add cleanup if needed
4. Document in this file
5. Add example usage
