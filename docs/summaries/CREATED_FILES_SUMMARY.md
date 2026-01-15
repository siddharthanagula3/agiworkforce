# E2E Test Utilities - Creation Summary

Date: 2026-01-03
Location: `apps/web/e2e/utils/`

## Overview

Created comprehensive test utility classes and functions for end-to-end testing of Supabase and Stripe integrations in the AGI Workforce web application.

## Files Created

### 1. test-database.ts (247 lines)

**Purpose**: Supabase database operations for E2E tests

**Class**: `TestDatabase`

**Key Methods**:

- `connect()` - Initialize Supabase admin client using service role key
- `createTestUser(email: string, password: string)` - Create user via admin API
- `deleteTestUser(userId: string)` - Delete user by ID
- `getUserByEmail(email: string)` - Find user ID by email
- `getSubscription(userId: string)` - Query subscriptions table
- `getProfile(userId: string)` - Query profiles table
- `waitForSubscription(userId: string, timeout?: number)` - Poll subscriptions with exponential backoff
- `cleanup(userId?: string)` - Remove test data (subscriptions, profiles)
- `disconnect()` - Close connection

**Types Exported**:

- `TestUserCredentials` - User ID, email, password
- `SubscriptionRecord` - Complete subscription data
- `ProfileRecord` - Complete profile data

**Dependencies**:

- `@supabase/supabase-js` - Supabase client
- `NEXT_PUBLIC_SUPABASE_URL` - Environment variable
- `SUPABASE_SERVICE_ROLE_KEY` - Environment variable

### 2. stripe-helpers.ts (228 lines)

**Purpose**: Stripe API operations for test scenarios

**Class**: `StripeHelpers`

**Key Methods**:

- `getTestCardDetails()` - Return 4242... test card with 12/25 expiry, 123 CVC
- `getAlternateTestCard()` - Return 4000002500003155 card
- `getDeclineTestCard()` - Return declining test card
- `getCheckoutSession(sessionId: string)` - Retrieve checkout session
- `getSubscription(subscriptionId: string)` - Retrieve subscription details
- `cancelTestSubscription(subscriptionId: string)` - Cancel subscription (marks cancel_at_period_end)
- `createTestCustomer(email: string, name?: string)` - Create Stripe customer
- `deleteTestCustomer(customerId: string)` - Delete customer
- `getTestPrice(priceId: string)` - Get price by ID
- `listTestProducts(limit?: number)` - List products (default: 10)
- `listTestPrices(productId: string, limit?: number)` - List prices for product
- `getCustomerSubscriptions(customerId: string)` - Get active subscriptions
- `getCustomer(customerId: string)` - Retrieve customer
- `updateCustomerMetadata(customerId: string, metadata: object)` - Update metadata

**Types Exported**:

- `TestCardDetails` - Card number, expiry month/year, CVC
- `CheckoutSessionInfo` - Session details
- `SubscriptionInfo` - Subscription details

**Dependencies**:

- `stripe` package - Stripe Node.js SDK
- `STRIPE_SECRET_KEY` - Environment variable

### 3. wait-helpers.ts (185 lines)

**Purpose**: Playwright helper functions for waiting and polling

**Exported Functions**:

- `waitForUrl(page, pattern, timeout?)` - Wait for URL to match pattern (string or regex)
- `waitForNetworkIdle(page, timeout?)` - Wait for all network requests to complete
- `pollUntil<T>(fn, condition, timeout?, interval?)` - Poll function with exponential backoff (1.5x multiplier)
- `waitForElement(page, selector, timeout?)` - Wait for element to become visible
- `waitForElementHidden(page, selector, timeout?)` - Wait for element to become hidden
- `waitForNavigation(page, timeout?)` - Wait for navigation to complete
- `waitForResponse(page, predicate, timeout?)` - Wait for response matching predicate
- `waitForRequest(page, predicate, timeout?)` - Wait for request matching predicate
- `waitForAsync<T>(fn, timeout?)` - Wait for async function to complete
- `delay(ms)` - Simple sleep/delay utility

**Features**:

- Exponential backoff in `pollUntil` (capped at 5000ms or 1/4 of timeout)
- Descriptive error messages with timing info
- Type-safe generic support

**Dependencies**:

- `@playwright/test` - Playwright test library

### 4. index.ts (20 lines)

**Purpose**: Centralized exports for all utilities

**Exports**: All classes and functions from the three main files

**Usage**:

```typescript
import { TestDatabase, StripeHelpers, waitForUrl, pollUntil } from './utils';
```

### 5. README.md (7.8 KB)

**Purpose**: Comprehensive documentation

**Contents**:

- Overview of each utility class and function
- Usage examples and code samples
- Environment variable requirements
- Integration examples with E2E tests
- Best practices for testing
- Troubleshooting guide

### 6. subscription.test.ts (3.5 KB, in e2e root)

**Purpose**: Example E2E test demonstrating utility usage

**Test Cases**:

- Create test user and verify profile
- Get Stripe test card details
- Get alternate Stripe test cards
- Create and delete Stripe customer
- Wait for subscription using polling
- Update customer metadata
- List Stripe products and prices
- Clean up test database

## Technical Details

### Error Handling

- All async operations include try/catch with descriptive errors
- Polling operations retry on errors with exponential backoff
- Proper error messages include context (timeout values, user IDs, etc.)

### Type Safety

- Full TypeScript support with exported interfaces
- Generic type parameters for polling functions
- Proper return type annotations on all methods

### Modern Patterns

- Async/await throughout (no callbacks or promises)
- Exponential backoff implementation for polling
- Connection pooling/reuse for database operations
- Environment variable fallbacks with error handling

### Testing Best Practices

- Proper resource cleanup via try/finally patterns
- Service role key usage for admin operations (best practice for Supabase)
- Test card numbers for Stripe testing
- Polling for async operations (subscriptions, API calls)

## Integration Points

### With Existing Code

- Follows patterns from `lib/services/subscription-service.ts`
- Uses same Supabase initialization as webhook handlers
- Stripe API version matches app configuration (2025-12-15.clover)
- Compatible with existing Playwright test setup

### Environment Variables

**Required**:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_test_...
```

**Optional**: Can be passed to class constructors if not in environment

## File Sizes

- test-database.ts: 6.2 KB (247 lines)
- stripe-helpers.ts: 5.8 KB (228 lines)
- wait-helpers.ts: 5.2 KB (185 lines)
- index.ts: 514 B (20 lines)
- README.md: 7.8 KB
- Total: 680 lines of TypeScript code

## Next Steps

1. **Install Playwright** (already in package.json)
2. **Configure environment variables** in .env.local
3. **Create E2E tests** using the utilities
4. **Run tests**: `pnpm test:e2e`
5. **Monitor coverage**: `pnpm test:e2e --coverage`

## Example Usage

```typescript
import { TestDatabase, StripeHelpers, waitForUrl } from './e2e/utils';

test('subscription flow', async ({ page }) => {
  const db = new TestDatabase();
  const stripe = new StripeHelpers();

  await db.connect();

  try {
    // Create user
    const user = await db.createTestUser('test@example.com', 'password');

    // Get test card
    const card = stripe.getTestCardDetails();

    // Navigate and fill form
    await page.goto('/checkout');
    await page.fill('[name="cardNumber"]', card.number);

    // Submit and wait
    await page.click('button[type="submit"]');
    await waitForUrl(page, /.*\/success/);

    // Verify subscription created
    const sub = await db.waitForSubscription(user.id, 30000);
    expect(sub.status).toBe('active');
  } finally {
    await db.cleanup(user.id);
    await db.disconnect();
  }
});
```

## Verification

All files compile with TypeScript strict mode. No type errors related to the new utilities.

Created files are production-ready with comprehensive error handling, JSDoc comments, and full test coverage capabilities.
