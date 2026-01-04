# E2E Tests for Signup and Checkout Flow

This directory contains comprehensive end-to-end tests for the AGI Workforce web application's signup and payment flow.

## Test Files

### signup-checkout-flow.spec.ts

The main E2E test file that validates the complete user journey from account creation through subscription purchase.

#### Test Suites

##### 1. Signup and Checkout Flow

**Main Test: "should complete signup, purchase subscription, and verify webhook processing"**

This comprehensive test covers the entire signup and checkout journey in 12 detailed steps:

1. **Signup** - Create a new user account via signup form
2. **Verify User** - Confirm auto-redirect and retrieve user ID from database
3. **Navigate to Pricing** - Access the pricing page with available plans
4. **Select Plan** - Choose the Hobby plan for subscription
5. **Wait for Checkout** - Allow Stripe checkout page to load
6. **Fill Card Details** - Enter test card and billing information
7. **Submit Payment** - Process the payment through Stripe
8. **Dashboard Redirect** - Confirm redirect to dashboard after payment
9. **Webhook Processing** - Poll database for subscription creation (30-second timeout)
10. **Verify Subscription** - Confirm subscription details in database
11. **Dashboard Verification** - Verify dashboard shows active subscription
12. **Cleanup** - Cancel test subscription to clean up Stripe

##### 2. Edge Cases

**Test: "should handle duplicate email signup gracefully"**

- Validates that attempting to sign up with an existing email shows appropriate error
- Verifies error handling and form behavior with duplicate credentials

**Test: "should handle canceled checkout flow"**

- Simulates user canceling payment during checkout
- Confirms no subscription is created when checkout is abandoned
- Validates proper cleanup of incomplete payment sessions

## Setup and Fixtures

Tests use custom Playwright fixtures defined in `../fixtures/index.ts`:

- **signupPage** - SignupPage object for signup interactions
- **pricingPage** - PricingPage object for pricing page interactions
- **stripePage** - StripePage object for Stripe checkout interactions
- **dashboardPage** - DashboardPage object for dashboard verification
- **testDb** - TestDatabase instance for database queries and verification
- **stripeHelpers** - StripeHelpers instance for Stripe API operations
- **testUser** - Auto-generated test user with unique email (timestamp-based)

## Key Features

### Comprehensive Logging

Every step logs detailed information for debugging:

```
STEP 1: Navigating to signup page and creating new user account...
STEP 2: Verifying auto-redirect and retrieving user ID...
...
```

### Robust Error Handling

- Try-catch blocks for non-critical operations
- Graceful fallbacks for timeout scenarios
- Detailed error messages for debugging

### Database Polling

- Waits for webhook to process subscription (up to 30 seconds)
- Uses exponential backoff for efficient polling
- Validates all subscription fields

### Complete Cleanup

- Cancels Stripe subscriptions after test
- Deletes test users from database
- Ensures no test data pollution

### Async/Await Pattern

- Modern async/await throughout
- Proper promise handling
- Clean, readable code structure

## Running the Tests

```bash
# Run all E2E tests
cd apps/web
pnpm exec playwright test

# Run just the signup-checkout flow tests
pnpm exec playwright test signup-checkout-flow

# Run with UI mode for debugging
pnpm exec playwright test signup-checkout-flow --ui

# Run a single test
pnpm exec playwright test signup-checkout-flow -g "should complete signup"
```

## Environment Variables

Required for tests to run:

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `STRIPE_SECRET_KEY` - Stripe secret API key

## Assertions

The tests use Playwright's built-in `expect()` for assertions:

```typescript
expect(page.url()).toContain('/signup');
expect(subscription?.plan_tier).toBe('hobby');
expect(subscription?.status).toBe('active');
expect(isActive).toBeTruthy();
```

## Database Verification

Tests verify data in the Supabase database directly:

```typescript
// Get user ID
const userId = await testDb.getUserByEmail(testUser.email);

// Poll for subscription creation
const subscription = await testDb.waitForSubscription(userId, 30000);

// Verify subscription fields
expect(subscription?.plan_tier).toBe('hobby');
expect(subscription?.stripe_customer_id).toBeTruthy();
```

## Stripe Integration

Tests use real Stripe test mode API:

```typescript
// Get test card details
const card = stripeHelpers.getTestCardDetails();

// Cancel test subscription after test
await stripeHelpers.cancelTestSubscription(subscription.stripe_subscription_id);
```

## Notes

- Tests use Stripe test card: `4242 4242 4242 4242`
- Test emails are auto-generated with timestamps to prevent conflicts
- Webhook processing typically takes 1-5 seconds but test waits up to 30 seconds
- All test data is cleaned up automatically after test completion
- Tests can be run in parallel (Playwright default)

## Troubleshooting

### Test times out waiting for subscription

- Check Stripe webhook configuration in production
- Verify `SUPABASE_SERVICE_ROLE_KEY` environment variable
- Check Stripe event logs for webhook delivery failures

### Duplicate email errors in tests

- Ensure timestamps are unique or use longer intervals
- Check that cleanup is running properly after test failures

### Checkout page doesn't load

- Verify Stripe publishable key is configured correctly
- Check browser console for JS errors in Playwright logs
- Ensure checkout page elements are correctly targeted

## References

- [Playwright Testing Documentation](https://playwright.dev/docs/intro)
- [Stripe Test Cards](https://stripe.com/docs/testing)
- [Supabase Testing Guide](https://supabase.com/docs/guides/api)
