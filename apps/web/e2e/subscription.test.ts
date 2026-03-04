import { test, expect } from '@playwright/test';
import { TestDatabase, StripeHelpers } from './utils';

/**
 * Example E2E tests demonstrating subscription and Stripe integration
 * using the test utility classes
 */

test.describe('Subscription and Stripe Integration Tests', () => {
  let db: TestDatabase;
  let stripe: StripeHelpers;

  test.beforeAll(async () => {
    // Initialize test utilities
    db = new TestDatabase();
    stripe = new StripeHelpers();
    await db.connect();
  });

  test.afterAll(async () => {
    await db.disconnect();
  });

  test('create test user and verify profile', async () => {
    const timestamp = Date.now();
    const email = `test-${timestamp}@example.com`;
    const password = 'test-password-123';

    // Create test user
    const user = await db.createTestUser(email, password);
    expect(user.id).toBeTruthy();
    expect(user.email).toBe(email);

    try {
      // Verify user exists and can be found by email
      const foundUserId = await db.getUserByEmail(email);
      expect(foundUserId).toBe(user.id);

      // Verify profile was created
      const profile = await db.getProfile(user.id);
      expect(profile?.id).toBe(user.id);
      expect(profile?.email).toBe(email);
    } finally {
      // Clean up
      await db.deleteTestUser(user.id);
    }
  });

  test('get stripe test card details', () => {
    // Get test card details for Stripe integration
    const card = stripe.getTestCardDetails();

    expect(card.number).toBe('4242424242424242');
    expect(card.exp_month).toBe(12);
    expect(card.exp_year).toBe(25);
    expect(card.cvc).toBe('123');
  });

  test('get alternate stripe test cards', () => {
    // Alternate card
    const alternateCard = stripe.getAlternateTestCard();
    expect(alternateCard.number).toBe('4000002500003155');

    // Declining card
    const declineCard = stripe.getDeclineTestCard();
    expect(declineCard.number).toBe('4000000000000002');
  });

  test('create and delete stripe customer', async () => {
    const timestamp = Date.now();
    const email = `customer-${timestamp}@example.com`;
    const customerName = 'Test Customer';

    // Create Stripe customer
    const customerId = await stripe.createTestCustomer(email, customerName);
    expect(customerId).toBeTruthy();
    expect(customerId).toMatch(/^cus_/);

    try {
      // Retrieve customer
      const customer = await stripe.getCustomer(customerId);
      expect(customer).toBeTruthy();
    } finally {
      // Clean up
      await stripe.deleteTestCustomer(customerId);
    }
  });

  test('wait for subscription using polling', async () => {
    const timestamp = Date.now();
    const email = `sub-test-${timestamp}@example.com`;

    // Create test user
    const user = await db.createTestUser(email, 'password123');

    try {
      // Verify user profile exists
      const profile = await db.getProfile(user.id);
      expect(profile?.id).toBe(user.id);

      // Subscription should be null for new user
      const subscription = await db.getSubscription(user.id);
      expect(subscription).toBeNull();

      // In a real test, you would trigger subscription creation here
      // then use waitForSubscription to poll for it:
      // const subscription = await db.waitForSubscription(user.id, 30000);
      // expect(subscription.status).toBe('active');
    } finally {
      await db.cleanup(user.id);
    }
  });

  test('update customer metadata', async () => {
    const timestamp = Date.now();
    const email = `meta-test-${timestamp}@example.com`;

    // Create Stripe customer
    const customerId = await stripe.createTestCustomer(email, 'Test Customer');

    try {
      // Update customer metadata
      const metadata = {
        user_id: 'test-user-123',
        plan_tier: 'pro',
        test_marker: 'example-test',
      };

      await stripe.updateCustomerMetadata(customerId, metadata);

      // Retrieve customer to verify metadata
      const customer = await stripe.getCustomer(customerId);
      expect(customer).toBeTruthy();
    } finally {
      await stripe.deleteTestCustomer(customerId);
    }
  });

  test('list stripe products and prices', async () => {
    const products = await stripe.listTestProducts(5);
    expect(Array.isArray(products)).toBe(true);

    // If there are products, list prices for the first one
    if (products.length > 0) {
      const prices = await stripe.listTestPrices(products[0]!.id, 5);
      expect(Array.isArray(prices)).toBe(true);
    }
  });

  test('clean up test database', async () => {
    const timestamp = Date.now();
    const email = `cleanup-test-${timestamp}@example.com`;

    // Create test user
    const user = await db.createTestUser(email, 'password123');

    // Verify user exists
    let foundUser = await db.getUserByEmail(email);
    expect(foundUser).toBe(user.id);

    // Clean up - delete user and profiles
    await db.cleanup(user.id);
    await db.deleteTestUser(user.id);

    // Verify user is deleted
    foundUser = await db.getUserByEmail(email);
    expect(foundUser).toBeNull();
  });
});
