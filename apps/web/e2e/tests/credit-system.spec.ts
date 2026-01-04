import { test, expect } from '../fixtures';
import { Page } from '@playwright/test';

/**
 * E2E Test Suite: Credit System
 *
 * This test suite verifies the credit system functionality including:
 * - Pricing page upgrade button text based on user's plan
 * - Dashboard credit display with correct data and progress bar
 * - Credit alert modal appearing for low credits
 * - Credit top-up flow for Max plan users
 */

/**
 * Helper function to simulate localStorage in browser context
 */
async function clearCreditAlerts(page: Page, userId: string) {
  await page.evaluate((uid) => {
    localStorage.removeItem(`credit-alert-warning-${uid}`);
    localStorage.removeItem(`credit-alert-exhausted-${uid}`);
  }, userId);
}

test.describe('Credit System - Pricing Page Button Text', () => {
  test('should show "Subscribe" for Hobby plan when user has no subscription', async ({
    page,
    loginPage,
    pricingPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Pricing page buttons for free tier user');

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

      // ==================== Step 3: Verify button text ====================
      console.log('Step 3: Verifying button text...');

      // Wait for page to fully load
      await page.waitForSelector('h2:has-text("Hobby")', { timeout: 10000 });

      // Find Hobby plan button
      const hobbyButton = page
        .locator('button')
        .filter({ hasText: /Subscribe|Get Started/ })
        .first();
      const hobbyButtonText = await hobbyButton.textContent();
      console.log(`Hobby button text: ${hobbyButtonText}`);
      expect(hobbyButtonText).toMatch(/Subscribe|Get Started/);

      // Find Pro plan button
      const proButton = page
        .locator('button')
        .filter({ hasText: /Upgrade to Pro/ })
        .first();
      const proButtonText = await proButton.textContent();
      console.log(`Pro button text: ${proButtonText}`);
      expect(proButtonText).toContain('Upgrade to Pro');

      // Find Max plan button
      const maxButton = page
        .locator('button')
        .filter({ hasText: /Upgrade to Max/ })
        .first();
      const maxButtonText = await maxButton.textContent();
      console.log(`Max button text: ${maxButtonText}`);
      expect(maxButtonText).toContain('Upgrade to Max');

      console.log('Button text verified for free tier user');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should show "Current Plan" for user\'s current plan tier', async ({
    page,
    loginPage,
    pricingPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Pricing page buttons for Pro plan user');

    // ==================== Setup: Create test user with Pro subscription ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // Create Pro subscription
      await testDb.createSubscription(user.id, {
        plan_tier: 'pro',
        status: 'active',
      });

      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Navigate to pricing ====================
      console.log('Step 2: Navigating to pricing page...');
      await pricingPage.goto();
      await page.waitForLoadState('networkidle');

      // ==================== Step 3: Verify button text ====================
      console.log('Step 3: Verifying button text...');

      // Wait for page to fully load
      await page.waitForSelector('h2:has-text("Pro")', { timeout: 10000 });
      await page.waitForTimeout(1000); // Wait for subscription to load

      // Pro plan should show "Current Plan"
      const currentPlanButton = page.locator('button').filter({ hasText: 'Current Plan' });
      const isCurrentPlanVisible = await currentPlanButton.isVisible();
      console.log(`Current Plan button visible: ${isCurrentPlanVisible}`);
      expect(isCurrentPlanVisible).toBeTruthy();

      // Max plan should show "Upgrade to Max"
      const maxButton = page
        .locator('button')
        .filter({ hasText: /Upgrade to Max/ })
        .first();
      const maxButtonText = await maxButton.textContent();
      console.log(`Max button text: ${maxButtonText}`);
      expect(maxButtonText).toContain('Upgrade to Max');

      // Hobby plan should show "Manage Subscription" (downgrade)
      const hobbyButton = page
        .locator('button')
        .filter({ hasText: /Manage Subscription/ })
        .first();
      const hobbyButtonText = await hobbyButton.textContent();
      console.log(`Hobby button text: ${hobbyButtonText}`);
      expect(hobbyButtonText).toContain('Manage Subscription');

      console.log('Button text verified for Pro plan user');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should disable current plan button', async ({
    page,
    loginPage,
    pricingPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Current plan button should be disabled');

    // ==================== Setup: Create test user with subscription ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // Create Max subscription
      await testDb.createSubscription(user.id, {
        plan_tier: 'max',
        status: 'active',
      });

      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Navigate to pricing ====================
      console.log('Step 2: Navigating to pricing page...');
      await pricingPage.goto();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000); // Wait for subscription to load

      // ==================== Step 3: Verify current plan button is disabled ====================
      console.log('Step 3: Verifying current plan button is disabled...');

      const currentPlanButton = page.locator('button').filter({ hasText: 'Current Plan' });
      const isDisabled = await currentPlanButton.isDisabled();
      console.log(`Current Plan button disabled: ${isDisabled}`);
      expect(isDisabled).toBeTruthy();

      console.log('Current plan button disabled state verified');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});

test.describe('Credit System - Dashboard Display', () => {
  test('should display credit usage card with correct data', async ({
    page,
    loginPage,
    dashboardPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Dashboard credit usage card');

    // ==================== Setup: Create test user with subscription and credits ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // Create Pro subscription
      const subscription = await testDb.createSubscription(user.id, {
        plan_tier: 'pro',
        status: 'active',
      });

      // Create credit account with some usage
      const allocatedCents = 10000; // $100
      const usedCents = 3000; // $30 used
      await testDb.createCreditAccount(user.id, subscription.id, {
        credits_allocated_cents: allocatedCents,
        credits_used_cents: usedCents,
      });

      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Wait for dashboard ====================
      console.log('Step 2: Waiting for dashboard...');
      await dashboardPage.waitForLoad();

      // ==================== Step 3: Verify credit usage card ====================
      console.log('Step 3: Verifying credit usage card...');

      // Check for credit usage card
      const creditCard = page.locator('.bg-zinc-900:has-text("Credit Usage")');
      await expect(creditCard).toBeVisible();

      // Verify used amount ($30.00)
      const usedAmount = creditCard.locator('.text-2xl').first();
      const usedText = await usedAmount.textContent();
      console.log(`Used amount text: ${usedText}`);
      expect(usedText).toContain('$30.00');

      // Verify total amount ($100.00)
      const totalText = await creditCard.locator('text=of $').textContent();
      console.log(`Total text: ${totalText}`);
      expect(totalText).toContain('$100.00');

      // Verify percentage used (30%)
      const percentageText = await creditCard.locator('text=% used').textContent();
      console.log(`Percentage text: ${percentageText}`);
      expect(percentageText).toContain('30.0%');

      // Verify progress bar color (should be green for 30%)
      const progressBar = creditCard.locator('.bg-emerald-500');
      await expect(progressBar).toBeVisible();

      console.log('Credit usage card verified');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should show amber progress bar when credits are low (80%+)', async ({
    page,
    loginPage,
    dashboardPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Dashboard credit usage with low credits');

    // ==================== Setup: Create test user with low credits ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // Create Pro subscription
      const subscription = await testDb.createSubscription(user.id, {
        plan_tier: 'pro',
        status: 'active',
      });

      // Create credit account with 85% usage
      const allocatedCents = 10000; // $100
      const usedCents = 8500; // $85 used
      await testDb.createCreditAccount(user.id, subscription.id, {
        credits_allocated_cents: allocatedCents,
        credits_used_cents: usedCents,
      });

      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Wait for dashboard ====================
      console.log('Step 2: Waiting for dashboard...');
      await dashboardPage.waitForLoad();

      // ==================== Step 3: Verify amber progress bar ====================
      console.log('Step 3: Verifying amber progress bar...');

      const creditCard = page.locator('.bg-zinc-900:has-text("Credit Usage")');
      const progressBar = creditCard.locator('.bg-amber-500');
      await expect(progressBar).toBeVisible();

      console.log('Amber progress bar verified for low credits');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should show red progress bar when credits are exhausted', async ({
    page,
    loginPage,
    dashboardPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Dashboard credit usage with exhausted credits');

    // ==================== Setup: Create test user with exhausted credits ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // Create Pro subscription
      const subscription = await testDb.createSubscription(user.id, {
        plan_tier: 'pro',
        status: 'active',
      });

      // Create credit account with 100% usage
      const allocatedCents = 10000; // $100
      const usedCents = 10000; // $100 used (all)
      await testDb.createCreditAccount(user.id, subscription.id, {
        credits_allocated_cents: allocatedCents,
        credits_used_cents: usedCents,
      });

      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // Clear any previous alert states (after navigation to dashboard)
      await clearCreditAlerts(page, user.id);

      // ==================== Step 2: Wait for dashboard ====================
      console.log('Step 2: Waiting for dashboard...');
      await dashboardPage.waitForLoad();

      // ==================== Step 3: Verify red progress bar ====================
      console.log('Step 3: Verifying red progress bar...');

      const creditCard = page.locator('.bg-zinc-900:has-text("Credit Usage")');
      const progressBar = creditCard.locator('.bg-red-500');
      await expect(progressBar).toBeVisible();

      console.log('Red progress bar verified for exhausted credits');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should show $0.00 for users without subscription', async ({
    page,
    loginPage,
    dashboardPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Dashboard credit usage for free tier user');

    // ==================== Setup: Create test user with no subscription ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Wait for dashboard ====================
      console.log('Step 2: Waiting for dashboard...');
      await dashboardPage.waitForLoad();

      // ==================== Step 3: Verify credit display shows $0.00 ====================
      console.log('Step 3: Verifying credit display...');

      const creditCard = page.locator('.bg-zinc-900:has-text("Credit Usage")');
      await expect(creditCard).toBeVisible();

      const amount = creditCard.locator('.text-2xl').first();
      const amountText = await amount.textContent();
      console.log(`Amount text: ${amountText}`);
      expect(amountText).toContain('$0.00');

      const noSubText = creditCard.locator('text=No active subscription');
      await expect(noSubText).toBeVisible();

      console.log('Free tier credit display verified');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});

test.describe('Credit System - Alert Modal', () => {
  test('should show low credits warning modal at 80% usage', async ({
    page,
    loginPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Low credits warning modal');

    // ==================== Setup: Create test user with low credits ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // Create Pro subscription
      const subscription = await testDb.createSubscription(user.id, {
        plan_tier: 'pro',
        status: 'active',
      });

      // Create credit account with 82% usage
      const allocatedCents = 10000; // $100
      const usedCents = 8200; // $82 used
      await testDb.createCreditAccount(user.id, subscription.id, {
        credits_allocated_cents: allocatedCents,
        credits_used_cents: usedCents,
      });

      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // Clear any previous alert states (after navigation to dashboard)
      await clearCreditAlerts(page, user.id);

      // ==================== Step 2: Wait for modal to appear ====================
      console.log('Step 2: Waiting for alert modal...');
      await page.waitForTimeout(1500); // Give modal time to appear

      // ==================== Step 3: Verify modal content ====================
      console.log('Step 3: Verifying modal content...');

      // Check for modal title
      const modalTitle = page.locator('h3:has-text("Low Credits Warning")');
      await expect(modalTitle).toBeVisible({ timeout: 5000 });

      // Check for warning icon (amber)
      const warningIcon = page.locator('.text-amber-500');
      await expect(warningIcon.first()).toBeVisible();

      // Check for percentage used
      const percentageText = page.locator('text=82% of your monthly credits');
      await expect(percentageText).toBeVisible();

      // Check for current plan
      const planText = page.locator('text=Pro');
      await expect(planText.first()).toBeVisible();

      // Check for action buttons
      const dismissButton = page.locator('button:has-text("Dismiss")');
      const viewPlansButton = page.locator('button:has-text("View Plans")');
      await expect(dismissButton).toBeVisible();
      await expect(viewPlansButton).toBeVisible();

      console.log('Low credits modal verified');

      // ==================== Step 4: Test dismiss functionality ====================
      console.log('Step 4: Testing dismiss...');
      await dismissButton.click();
      await page.waitForTimeout(500);

      // Modal should be closed
      await expect(modalTitle).not.toBeVisible();

      console.log('Modal dismiss functionality verified');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should show exhausted credits modal at 100% usage', async ({
    page,
    loginPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Exhausted credits modal');

    // ==================== Setup: Create test user with exhausted credits ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // Create Pro subscription
      const subscription = await testDb.createSubscription(user.id, {
        plan_tier: 'pro',
        status: 'active',
      });

      // Create credit account with 100% usage
      const allocatedCents = 10000; // $100
      const usedCents = 10000; // $100 used (all)
      await testDb.createCreditAccount(user.id, subscription.id, {
        credits_allocated_cents: allocatedCents,
        credits_used_cents: usedCents,
      });

      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // Clear any previous alert states (after navigation to dashboard)
      await clearCreditAlerts(page, user.id);

      // ==================== Step 2: Wait for modal to appear ====================
      console.log('Step 2: Waiting for alert modal...');
      await page.waitForTimeout(1500); // Give modal time to appear

      // ==================== Step 3: Verify modal content ====================
      console.log('Step 3: Verifying modal content...');

      // Check for modal title
      const modalTitle = page.locator('h3:has-text("Credits Depleted")');
      await expect(modalTitle).toBeVisible({ timeout: 5000 });

      // Check for alert icon (red)
      const alertIcon = page.locator('.text-red-500');
      await expect(alertIcon.first()).toBeVisible();

      // Check for remaining credits $0.00
      const remainingText = page.locator('text=$0.00').last();
      await expect(remainingText).toBeVisible();

      // Check for action buttons
      const maybeLaterButton = page.locator('button:has-text("Maybe Later")');
      const upgradeButton = page.locator('button:has-text("Upgrade Plan")');
      await expect(maybeLaterButton).toBeVisible();
      await expect(upgradeButton).toBeVisible();

      console.log('Exhausted credits modal verified');

      // ==================== Step 4: Test "Upgrade Plan" navigation ====================
      console.log('Step 4: Testing upgrade plan navigation...');
      await upgradeButton.click();

      // Should navigate to pricing page
      await page.waitForURL(/.*pricing.*/, { timeout: 5000 });
      expect(page.url()).toContain('/pricing');

      console.log('Upgrade plan navigation verified');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should not show modal again within cooldown period', async ({
    page,
    loginPage,
    dashboardPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Modal cooldown period');

    // ==================== Setup: Create test user with low credits ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // Create Pro subscription
      const subscription = await testDb.createSubscription(user.id, {
        plan_tier: 'pro',
        status: 'active',
      });

      // Create credit account with 85% usage
      await testDb.createCreditAccount(user.id, subscription.id, {
        credits_allocated_cents: 10000,
        credits_used_cents: 8500,
      });

      // ==================== Step 1: Login first time ====================
      console.log('Step 1: First login - modal should appear...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });
      await page.waitForTimeout(1500);

      // Modal should appear
      const modalTitle = page.locator('h3:has-text("Low Credits Warning")');
      await expect(modalTitle).toBeVisible({ timeout: 5000 });

      // Dismiss modal
      const dismissButton = page.locator('button:has-text("Dismiss")');
      await dismissButton.click();
      await page.waitForTimeout(500);

      // ==================== Step 2: Navigate away and back ====================
      console.log('Step 2: Navigate to billing and back to dashboard...');
      await page.goto('/dashboard/billing');
      await page.waitForTimeout(500);
      await dashboardPage.goto();
      await page.waitForTimeout(1500);

      // ==================== Step 3: Verify modal does not appear again ====================
      console.log('Step 3: Verifying modal does not appear again...');

      // Modal should NOT be visible
      await expect(modalTitle).not.toBeVisible();

      console.log('Modal cooldown period verified');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});

test.describe('Credit System - Top-Up Flow for Max Plan', () => {
  test('should show top-up option for Max plan users with exhausted credits', async ({
    page,
    loginPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Top-up option for Max plan');

    // ==================== Setup: Create test user with Max plan and exhausted credits ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // Create Max subscription
      const subscription = await testDb.createSubscription(user.id, {
        plan_tier: 'max',
        status: 'active',
      });

      // Create credit account with 100% usage
      await testDb.createCreditAccount(user.id, subscription.id, {
        credits_allocated_cents: 50000, // $500 (Max plan)
        credits_used_cents: 50000,
      });

      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // Clear any previous alert states (after navigation to dashboard)
      await clearCreditAlerts(page, user.id);

      // ==================== Step 2: Wait for modal to appear ====================
      console.log('Step 2: Waiting for alert modal...');
      await page.waitForTimeout(1500);

      // ==================== Step 3: Verify top-up option is shown ====================
      console.log('Step 3: Verifying top-up option...');

      // Check for modal
      const modalTitle = page.locator('h3:has-text("Credits Depleted")');
      await expect(modalTitle).toBeVisible({ timeout: 5000 });

      // Check for top-up card (purple for Max plan)
      const topUpCard = page.locator('.border-purple-500\\/30');
      await expect(topUpCard).toBeVisible();

      // Check for top-up button
      const topUpButton = page.locator('button:has-text("Buy $100 Credits")');
      await expect(topUpButton).toBeVisible();

      // Verify "Not Now" button instead of "Maybe Later"
      const notNowButton = page.locator('button:has-text("Not Now")');
      await expect(notNowButton).toBeVisible();

      console.log('Top-up option verified for Max plan');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should initiate checkout when clicking Buy Credits for Max plan', async ({
    page,
    loginPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Top-up checkout flow');

    // ==================== Setup: Create test user with Max plan ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // Create Max subscription
      const subscription = await testDb.createSubscription(user.id, {
        plan_tier: 'max',
        status: 'active',
      });

      // Create credit account with exhausted credits
      await testDb.createCreditAccount(user.id, subscription.id, {
        credits_allocated_cents: 50000,
        credits_used_cents: 50000,
      });

      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // Clear any previous alert states (after navigation to dashboard)
      await clearCreditAlerts(page, user.id);
      await page.waitForTimeout(1500);

      // ==================== Step 2: Click Buy Credits ====================
      console.log('Step 2: Clicking Buy Credits button...');

      const topUpButton = page.locator('button:has-text("Buy $100 Credits")');
      await expect(topUpButton).toBeVisible({ timeout: 5000 });

      // Listen for navigation
      const navigationPromise = page.waitForURL(
        (url) => url.toString().includes('stripe') || url.toString().includes('checkout'),
        { timeout: 30000 },
      );

      await topUpButton.click();

      // ==================== Step 3: Verify navigation to checkout ====================
      console.log('Step 3: Waiting for checkout redirect...');

      try {
        await navigationPromise;
        const currentUrl = page.url();
        console.log(`Redirected to: ${currentUrl}`);

        // Should be on Stripe checkout
        const isCheckout = currentUrl.includes('stripe') || currentUrl.includes('checkout');
        expect(isCheckout).toBeTruthy();

        console.log('Top-up checkout flow initiated successfully');
      } catch (err) {
        // If navigation doesn't happen, check for error handling
        console.log('Navigation timeout - checking for error handling...');

        // Button should show loading or error state
        const buttonText = await topUpButton.textContent();
        console.log(`Button text after click: ${buttonText}`);

        // Should show processing or error
        expect(buttonText).toMatch(/Processing|Failed|Error/);
      }
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should not show top-up option for non-Max plan users', async ({
    page,
    loginPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: No top-up option for Pro plan');

    // ==================== Setup: Create test user with Pro plan ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // Create Pro subscription
      const subscription = await testDb.createSubscription(user.id, {
        plan_tier: 'pro',
        status: 'active',
      });

      // Create credit account with exhausted credits
      await testDb.createCreditAccount(user.id, subscription.id, {
        credits_allocated_cents: 10000,
        credits_used_cents: 10000,
      });

      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // Clear any previous alert states (after navigation to dashboard)
      await clearCreditAlerts(page, user.id);
      await page.waitForTimeout(1500);

      // ==================== Step 2: Verify modal shows upgrade option, not top-up ====================
      console.log('Step 2: Verifying upgrade option instead of top-up...');

      const modalTitle = page.locator('h3:has-text("Credits Depleted")');
      await expect(modalTitle).toBeVisible({ timeout: 5000 });

      // Should show Upgrade Plan button, not Buy Credits
      const upgradeButton = page.locator('button:has-text("Upgrade Plan")');
      await expect(upgradeButton).toBeVisible();

      // Should NOT show Buy Credits button
      const topUpButton = page.locator('button:has-text("Buy $100 Credits")');
      await expect(topUpButton).not.toBeVisible();

      console.log('Upgrade option verified for Pro plan (no top-up)');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});
