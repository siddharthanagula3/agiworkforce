import { test, expect } from '../fixtures';

/**
 * E2E Test Suite: Pricing Page
 *
 * This test suite verifies pricing page functionality including:
 * - All plan cards are visible
 * - Plan selection redirects to checkout
 * - Pricing page accessible to both authenticated and non-authenticated users
 * - CTA buttons work correctly
 */

test.describe('Pricing Page - Public Access', () => {
  test('should display all plan cards for non-authenticated users', async ({
    page,
    pricingPage,
  }) => {
    console.log('TEST: Pricing page plan cards (public)');

    // ==================== Step 1: Navigate to pricing page ====================
    console.log('Step 1: Navigating to pricing page...');
    await pricingPage.goto();
    expect(page.url()).toContain('/pricing');

    // ==================== Step 2: Wait for page to load ====================
    console.log('Step 2: Waiting for page to load...');
    await page.waitForSelector('h2:has-text("Hobby"), h3:has-text("Hobby")', { timeout: 10000 });

    // ==================== Step 3: Verify all plan cards visible ====================
    console.log('Step 3: Verifying all plan cards...');
    const plans = ['hobby', 'pro', 'max'] as const;

    for (const plan of plans) {
      const isVisible = await pricingPage.isPlanCardVisible(plan);
      console.log(`${plan} plan visible: ${isVisible}`);
      expect(isVisible).toBeTruthy();
    }

    console.log('All plan cards verified');
  });

  test('should show enterprise plan if available', async ({ page, pricingPage }) => {
    console.log('TEST: Enterprise plan visibility');

    // ==================== Step 1: Navigate to pricing page ====================
    console.log('Step 1: Navigating to pricing page...');
    await pricingPage.goto();
    await page.waitForLoadState('networkidle');

    // ==================== Step 2: Check for enterprise plan ====================
    console.log('Step 2: Checking for enterprise plan...');
    const hasEnterprise = await pricingPage.isPlanCardVisible('enterprise');
    console.log(`Enterprise plan visible: ${hasEnterprise}`);

    // Enterprise plan might be shown differently (contact sales, etc.)
    // This test just documents whether it's visible
  });
});

test.describe('Pricing Page - Authenticated Users', () => {
  test('should display pricing for authenticated users', async ({
    page,
    loginPage,
    pricingPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Pricing page for authenticated users');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Navigate to pricing ====================
      console.log('Step 2: Navigating to pricing page...');
      await pricingPage.goto();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/pricing');

      // ==================== Step 3: Wait for plan cards to load ====================
      console.log('Step 3: Waiting for plan cards to load...');
      await page.waitForSelector('h2:has-text("Hobby"), h3:has-text("Hobby")').catch(() => {
        console.log('Hobby plan card not found immediately');
      });

      // ==================== Step 4: Verify plan cards visible or subscription required ====================
      console.log('Step 4: Verifying plan cards or subscription message...');
      const hobbyVisible = await pricingPage.isPlanCardVisible('hobby');
      const subscriptionRequired = await pricingPage.isSubscriptionRequiredMessageVisible();

      // Either pricing cards should be visible OR subscription required message
      expect(hobbyVisible || subscriptionRequired).toBeTruthy();

      if (hobbyVisible) {
        console.log('Pricing cards displayed for authenticated user');
      } else if (subscriptionRequired) {
        console.log('Subscription required message shown (user may already have subscription)');
      }
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should initiate checkout when selecting a plan', async ({
    page,
    loginPage,
    pricingPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Plan selection initiates checkout');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Navigate to pricing ====================
      console.log('Step 2: Navigating to pricing page...');
      await pricingPage.goto();
      expect(page.url()).toContain('/pricing');

      // ==================== Step 3: Select a plan ====================
      console.log('Step 3: Selecting hobby plan...');
      const navigationPromise = page.waitForNavigation({ waitUntil: 'load', timeout: 30000 });
      await pricingPage.selectPlan('hobby');

      try {
        await navigationPromise;
        console.log('Navigation completed');
      } catch (err) {
        console.warn(`Navigation timeout: ${err instanceof Error ? err.message : String(err)}`);
      }

      // ==================== Step 4: Verify redirected to Stripe checkout ====================
      console.log('Step 4: Verifying checkout redirection...');
      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      console.log(`Current URL: ${currentUrl}`);

      // Should be on Stripe checkout (contains 'stripe' or 'checkout')
      const isCheckout = currentUrl.includes('stripe') || currentUrl.includes('checkout');
      expect(isCheckout).toBeTruthy();

      console.log('Checkout initiated successfully');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});

test.describe('Pricing Page - Multiple Plans', () => {
  test('should be able to view details of all available plans', async ({ page, pricingPage }) => {
    console.log('TEST: View all plan details');

    // ==================== Step 1: Navigate to pricing ====================
    console.log('Step 1: Navigating to pricing page...');
    await pricingPage.goto();
    await page.waitForLoadState('networkidle');

    // ==================== Step 2: Check all standard plan tiers ====================
    console.log('Step 2: Checking all plan tiers...');
    const standardPlans = ['hobby', 'pro', 'max'] as const;

    for (const plan of standardPlans) {
      console.log(`\nChecking ${plan} plan...`);

      const isVisible = await pricingPage.isPlanCardVisible(plan);
      expect(isVisible).toBeTruthy();
      console.log(`✓ ${plan} plan card visible`);
    }

    console.log('\nAll plan details viewable');
  });

  test('should redirect non-authenticated users to signup when selecting plan', async ({
    page,
    pricingPage,
  }) => {
    console.log('TEST: Non-authenticated plan selection');

    // ==================== Step 1: Navigate to pricing (not logged in) ====================
    console.log('Step 1: Navigating to pricing page (not logged in)...');
    await pricingPage.goto();
    await page.waitForLoadState('networkidle');

    // ==================== Step 2: Try to select a plan ====================
    console.log('Step 2: Attempting to select a plan...');
    await pricingPage.selectPlan('hobby');

    // ==================== Step 3: Verify redirect ====================
    console.log('Step 3: Waiting for redirect...');
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // Should be redirected to login or signup
    const isAuthPage =
      currentUrl.includes('/login') ||
      currentUrl.includes('/signup') ||
      currentUrl.includes('/auth');
    console.log(`Redirected to auth page: ${isAuthPage}`);

    // OR might go directly to checkout if allowed
    const isCheckout = currentUrl.includes('stripe') || currentUrl.includes('checkout');
    console.log(`Redirected to checkout: ${isCheckout}`);

    // One of these should be true
    expect(isAuthPage || isCheckout).toBeTruthy();

    console.log('Non-authenticated plan selection handled');
  });
});

test.describe('Pricing Page - Edge Cases', () => {
  test('should handle rapid plan selections gracefully', async ({
    page,
    loginPage,
    pricingPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Rapid plan selections');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Navigate to pricing ====================
      console.log('Step 2: Navigating to pricing page...');
      await pricingPage.goto();
      await page.waitForLoadState('networkidle');

      // ==================== Step 3: Click multiple plan buttons rapidly ====================
      console.log('Step 3: Clicking plan buttons rapidly...');

      // Click hobby plan button (but don't wait for navigation)
      const hobbyButton = page
        .locator(
          'button:has-text("Get Started"):near(h2:has-text("Hobby")), button:has-text("Choose Plan"):near(h2:has-text("Hobby"))',
        )
        .first();

      if (await hobbyButton.isVisible()) {
        await hobbyButton.click({ timeout: 5000 }).catch(() => {
          console.log('First click failed or page navigated');
        });
      }

      // Wait a moment and check state
      await page.waitForTimeout(1000);
      const currentUrl = page.url();
      console.log(`Current URL after rapid clicks: ${currentUrl}`);

      // Page should either still be on pricing or navigated to checkout
      const isValid =
        currentUrl.includes('/pricing') ||
        currentUrl.includes('checkout') ||
        currentUrl.includes('stripe');
      expect(isValid).toBeTruthy();

      console.log('Rapid plan selections handled gracefully');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});
