# E2E Test Utilities

This directory contains utility classes and functions for end-to-end testing of Supabase and Stripe integrations.

## Files

### test-database.ts

The `TestDatabase` class provides methods to interact with Supabase for testing purposes.

**Usage:**

```typescript
import { TestDatabase } from './e2e/utils';

const db = new TestDatabase();
await db.connect();

// Create a test user
const user = await db.createTestUser('test@example.com', 'password123');

// Get subscription for user
const subscription = await db.getSubscription(user.id);

// Wait for subscription to appear (with polling)
const subscription = await db.waitForSubscription(user.id, 30000);

// Clean up
await db.cleanup(user.id);
await db.disconnect();
```

**Methods:**

- `connect()` - Initialize Supabase admin client
- `createTestUser(email: string, password: string)` - Create a test user with email/password
- `deleteTestUser(userId: string)` - Delete a test user by ID
- `getUserByEmail(email: string)` - Find user ID by email
- `getSubscription(userId: string)` - Get subscription record for user
- `getProfile(userId: string)` - Get profile record for user
- `waitForSubscription(userId: string, timeout?: number)` - Poll until subscription appears
- `cleanup(userId?: string)` - Remove test data (subscriptions and profiles)
- `disconnect()` - Close the connection

**Environment Variables:**

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (has full admin access)

### stripe-helpers.ts

The `StripeHelpers` class provides methods to interact with Stripe for testing.

**Usage:**

```typescript
import { StripeHelpers } from './e2e/utils';

const stripe = new StripeHelpers();

// Get test card details for Stripe
const card = stripe.getTestCardDetails();
// { number: '4242424242424242', exp_month: 12, exp_year: 25, cvc: '123' }

// Retrieve a checkout session
const session = await stripe.getCheckoutSession(sessionId);

// Retrieve a subscription
const subscription = await stripe.getSubscription(subscriptionId);

// Cancel a subscription
await stripe.cancelTestSubscription(subscriptionId);

// Create a test customer
const customerId = await stripe.createTestCustomer('test@example.com', 'Test Customer');

// Get customer subscriptions
const subscriptions = await stripe.getCustomerSubscriptions(customerId);
```

**Methods:**

- `getTestCardDetails()` - Return test card 4242... with 12/25 expiry, 123 CVC
- `getAlternateTestCard()` - Return alternate Visa debit test card
- `getDeclineTestCard()` - Return declining test card
- `getCheckoutSession(sessionId: string)` - Retrieve checkout session from Stripe
- `getSubscription(subscriptionId: string)` - Retrieve subscription details
- `cancelTestSubscription(subscriptionId: string)` - Cancel a test subscription
- `createTestCustomer(email: string, name?: string)` - Create a test customer
- `deleteTestCustomer(customerId: string)` - Delete a test customer
- `getTestPrice(priceId: string)` - Retrieve a price by ID
- `listTestProducts(limit?: number)` - List test products
- `listTestPrices(productId: string, limit?: number)` - List prices for a product
- `getCustomerSubscriptions(customerId: string)` - Get active subscriptions for customer
- `getCustomer(customerId: string)` - Retrieve a customer
- `updateCustomerMetadata(customerId: string, metadata: object)` - Update customer metadata

**Environment Variables:**

- `STRIPE_SECRET_KEY` - Stripe secret key for API access

### wait-helpers.ts

Utility functions for waiting and polling in Playwright tests.

**Usage:**

```typescript
import { waitForUrl, waitForNetworkIdle, pollUntil, waitForElement, delay } from './e2e/utils';

// Wait for URL to change to pattern
await waitForUrl(page, /.*\/success/);

// Wait for network to be idle
await waitForNetworkIdle(page);

// Poll a function until condition is met
const result = await pollUntil(
  async () => {
    const response = await fetch('/api/status');
    return response.json();
  },
  (data) => data.ready === true,
  10000, // timeout
  500, // initial interval
);

// Wait for element to appear
await waitForElement(page, '.success-message');

// Wait for element to disappear
await waitForElementHidden(page, '.loading');

// Wait for navigation to complete
await waitForNavigation(page);

// Wait for response matching predicate
await waitForResponse(page, (response) => response.url().includes('/api/checkout'));

// Wait for request matching predicate
await waitForRequest(page, (request) => request.postData()?.includes('email'));

// Simple delay/sleep
await delay(1000);
```

**Functions:**

- `waitForUrl(page, pattern, timeout?)` - Wait for URL to match pattern
- `waitForNetworkIdle(page, timeout?)` - Wait for all network requests to complete
- `pollUntil<T>(fn, condition, timeout?, interval?)` - Poll function with exponential backoff
- `waitForElement(page, selector, timeout?)` - Wait for element to be visible
- `waitForElementHidden(page, selector, timeout?)` - Wait for element to be hidden
- `waitForNavigation(page, timeout?)` - Wait for navigation to complete
- `waitForResponse(page, predicate, timeout?)` - Wait for matching network response
- `waitForRequest(page, predicate, timeout?)` - Wait for matching network request
- `waitForAsync<T>(fn, timeout?)` - Wait for async function to complete
- `delay(ms)` - Create a delay/sleep

## Integration with Tests

Example E2E test using these utilities:

```typescript
import { test, expect } from '@playwright/test';
import { TestDatabase, StripeHelpers, waitForUrl, waitForNetworkIdle } from './e2e/utils';

test('checkout and create subscription', async ({ page }) => {
  const db = new TestDatabase();
  const stripe = new StripeHelpers();

  await db.connect();

  try {
    // Create test user
    const user = await db.createTestUser('checkout-test@example.com', 'test-password-123');

    // Navigate to checkout
    await page.goto('/checkout');

    // Fill Stripe card details
    const card = stripe.getTestCardDetails();
    await page.fill('[name="cardNumber"]', card.number);

    // Submit and wait for success
    await page.click('button[type="submit"]');
    await waitForUrl(page, /.*\/success/);

    // Verify subscription was created in database
    const subscription = await db.waitForSubscription(user.id, 30000);
    expect(subscription.status).toBe('active');
  } finally {
    // Cleanup
    const userId = await db.getUserByEmail('checkout-test@example.com');
    if (userId) {
      await db.cleanup(userId);
    }
    await db.disconnect();
  }
});
```

## Best Practices

1. **Always cleanup**: Use try/finally to ensure cleanup code runs
2. **Use service role key**: The admin client uses service role key for full access
3. **Wait for async operations**: Use `waitForSubscription` or `pollUntil` for database operations
4. **Test card numbers**: Use Stripe's test card numbers in test environment only
5. **Environment variables**: Ensure all required env vars are set before running tests
6. **Timeout values**: Adjust timeouts based on your environment (slower CI may need longer)

## Testing Stripe Operations

Stripe operations in tests use real API calls to Stripe (not mocked). Make sure to:

1. Use test mode keys (starting with `pk_test_` or `sk_test_`)
2. Use test card numbers provided by `getTestCardDetails()`
3. Clean up test data (customers, subscriptions) after tests
4. Be aware of rate limits if running many tests in parallel

## Troubleshooting

**"Supabase configuration missing"** - Ensure environment variables are set:

```bash
export NEXT_PUBLIC_SUPABASE_URL=your-url
export SUPABASE_SERVICE_ROLE_KEY=your-key
export STRIPE_SECRET_KEY=your-key
```

**"Database not connected"** - Call `connect()` before using database methods

**"Condition not met after Xms"** - Polling timeout exceeded. Consider increasing timeout or checking test implementation

**Stripe API errors** - Verify you're using test mode keys and test card numbers
