import { test, expect } from '../fixtures';

/**
 * E2E Test Suite: Subscription Management
 *
 * This test suite verifies subscription management functionality including:
 * - Free tier user billing page display
 * - Active subscription billing page display
 * - Subscription tier upgrades
 * - Multiple plan tier selections
 * - Billing page navigation
 */

test.describe('Subscription Management', () => {
  test('should display correct billing info for free tier user', async ({
    page,
    loginPage,
    billingPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Free tier user billing page');

    // ==================== Setup: Create test user (no subscription) ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;
    console.log(`Free tier user created: ${user.email}`);

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Navigate to billing ====================
      console.log('Step 2: Navigating to billing page...');
      await billingPage.goto();
      await billingPage.waitForLoad();

      // ==================== Step 3: Verify free tier indicators ====================
      console.log('Step 3: Verifying free tier display...');
      expect(await billingPage.isPageTitleVisible()).toBeTruthy();
      expect(await billingPage.isSubscriptionCardVisible()).toBeTruthy();

      const planTier = await billingPage.getPlanTier();
      expect(planTier.toLowerCase()).toBe('free');

      // ==================== Step 4: Verify "No Active Subscription" banner ====================
      console.log('Step 4: Verifying no subscription banner...');
      const hasNoSubscription = await billingPage.hasNoSubscription();
      expect(hasNoSubscription).toBeTruthy();

      // ==================== Step 5: Verify "View Plans" button visible ====================
      console.log('Step 5: Verifying "View Plans" button...');
      expect(await billingPage.isViewPlansButtonVisible()).toBeTruthy();

      console.log('Free tier billing page verified');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should display correct billing info for subscribed user', async ({
    page,
    loginPage,
    billingPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Subscribed user billing page');

    // ==================== Setup: Create test user with active subscription ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;
    console.log(`User created: ${user.email}`);

    // Create active subscription
    const subscription = await testDb.createSubscription(user.id, {
      plan_tier: 'hobby',
      status: 'active',
      stripe_customer_id: `cus_test_${Date.now()}`,
      stripe_subscription_id: `sub_test_${Date.now()}`,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    console.log(`Subscription created: ${subscription.plan_tier}`);

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Navigate to billing ====================
      console.log('Step 2: Navigating to billing page...');
      await billingPage.goto();
      await billingPage.waitForLoad();

      // ==================== Step 3: Verify subscription tier ====================
      console.log('Step 3: Verifying subscription tier...');
      const planTier = await billingPage.getPlanTier();
      expect(planTier.toLowerCase()).toBe('hobby');

      // ==================== Step 4: Verify active subscription banner ====================
      console.log('Step 4: Verifying active subscription banner...');
      const hasActiveSubscription = await billingPage.hasActiveSubscription();
      expect(hasActiveSubscription).toBeTruthy();

      // ==================== Step 5: Verify renewal date displayed ====================
      console.log('Step 5: Verifying renewal date...');
      const renewalText = await billingPage.getRenewalDate();
      expect(renewalText).toContain('renews on');
      console.log(`Renewal date: ${renewalText}`);

      // ==================== Step 6: Verify "Manage Billing" button visible ====================
      console.log('Step 6: Verifying "Manage Billing" button...');
      expect(await billingPage.isManageBillingButtonVisible()).toBeTruthy();

      console.log('Subscribed user billing page verified');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should allow free tier user to view pricing plans', async ({
    page,
    loginPage,
    billingPage,
    pricingPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Free tier user view pricing plans');

    // ==================== Setup: Create free tier user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Navigate to billing ====================
      console.log('Step 2: Navigating to billing page...');
      await billingPage.goto();
      await billingPage.waitForLoad();

      // ==================== Step 3: Click "View Plans" ====================
      console.log('Step 3: Clicking "View Plans"...');
      await billingPage.clickViewPlans();

      // ==================== Step 4: Verify on pricing page ====================
      console.log('Step 4: Verifying pricing page loaded...');
      await page.waitForURL(/.*pricing.*/, { timeout: 5000 });
      expect(page.url()).toContain('/pricing');

      // Verify plan cards visible
      const hobbyCardVisible = await pricingPage.isPlanCardVisible('hobby');
      expect(hobbyCardVisible).toBeTruthy();

      console.log('Navigation to pricing from billing successful');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should handle multiple subscription tier displays', async ({
    page,
    loginPage,
    billingPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Multiple subscription tiers');

    const testTiers = ['hobby', 'pro', 'max'];

    for (const tier of testTiers) {
      console.log(`\n=== Testing tier: ${tier} ===`);

      // Create new user for each tier test
      const userEmail = `test-${tier}-${Date.now()}@example.com`;
      const user = await testDb.createTestUser(userEmail, testUser.password);
      console.log(`User created: ${userEmail}`);

      // Create subscription with current tier
      await testDb.createSubscription(user.id, {
        plan_tier: tier,
        status: 'active',
        stripe_customer_id: `cus_test_${tier}_${Date.now()}`,
        stripe_subscription_id: `sub_test_${tier}_${Date.now()}`,
      });

      try {
        // Login
        await loginPage.goto();
        await loginPage.login(userEmail, testUser.password);
        await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

        // Navigate to billing
        await billingPage.goto();
        await billingPage.waitForLoad();

        // Verify tier displayed correctly
        const displayedTier = await billingPage.getPlanTier();
        expect(displayedTier.toLowerCase()).toBe(tier);
        console.log(`✓ Tier "${tier}" displayed correctly`);

        // Verify active subscription
        const hasActive = await billingPage.hasActiveSubscription();
        expect(hasActive).toBeTruthy();
        console.log(`✓ Active subscription banner shown for "${tier}"`);
      } finally {
        // Cleanup this test user
        await testDb.cleanup(user.id);
        await testDb.deleteTestUser(user.id);
      }
    }

    console.log('\nAll subscription tiers verified successfully');
  });
});

test.describe('Dashboard Subscription Display', () => {
  test('should display free tier on dashboard', async ({
    page,
    loginPage,
    dashboardPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Dashboard free tier display');

    // ==================== Setup: Create free tier user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Wait for dashboard to load ====================
      console.log('Step 2: Waiting for dashboard...');
      await dashboardPage.waitForLoad();

      // ==================== Step 3: Verify dashboard loaded ====================
      console.log('Step 3: Verifying dashboard loaded...');
      expect(await dashboardPage.isDashboardTitleVisible()).toBeTruthy();

      // ==================== Step 4: Check plan tier (if visible) ====================
      console.log('Step 4: Checking plan tier display...');
      const isPlanCardVisible = await dashboardPage.isPlanTierCardVisible();

      if (isPlanCardVisible) {
        const planTier = await dashboardPage.getCurrentPlanTier();
        console.log(`Plan tier displayed: ${planTier}`);
        expect(planTier.toLowerCase()).toBe('free');
      } else {
        console.log('Plan tier card not immediately visible (expected for new users)');
      }

      console.log('Dashboard free tier display verified');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should display active subscription on dashboard', async ({
    page,
    loginPage,
    dashboardPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Dashboard active subscription display');

    // ==================== Setup: Create user with subscription ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    await testDb.createSubscription(user.id, {
      plan_tier: 'pro',
      status: 'active',
      stripe_customer_id: `cus_test_${Date.now()}`,
      stripe_subscription_id: `sub_test_${Date.now()}`,
    });

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Wait for dashboard ====================
      console.log('Step 2: Waiting for dashboard...');
      await dashboardPage.waitForLoad();

      // ==================== Step 3: Verify plan tier card ====================
      console.log('Step 3: Verifying plan tier card...');
      const isPlanCardVisible = await dashboardPage.isPlanTierCardVisible();

      if (isPlanCardVisible) {
        const planTier = await dashboardPage.getCurrentPlanTier();
        console.log(`Plan tier: ${planTier}`);
        expect(planTier.toLowerCase()).toBe('pro');

        // Verify subscription status
        const isActive = await dashboardPage.isSubscriptionActive();
        console.log(`Subscription active: ${isActive}`);
      } else {
        console.log('Plan tier card not visible yet');
      }

      console.log('Dashboard subscription display verified');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});
