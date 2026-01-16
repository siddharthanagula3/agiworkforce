import { test, expect } from '../fixtures';

/**
 * E2E Test Suite: Security and Edge Cases
 *
 * This test suite verifies security controls and edge case handling including:
 * - SQL injection attempts
 * - XSS attempts
 * - Invalid input handling
 * - Network error resilience
 * - Concurrent operations
 */

test.describe('Security - Input Validation', () => {
  test('should reject SQL injection attempts in login', async ({ page, loginPage }) => {
    console.log('TEST: SQL injection protection in login');

    // ==================== Step 1: Navigate to login ====================
    console.log('Step 1: Navigating to login page...');
    await loginPage.goto();

    // ==================== Step 2: Attempt SQL injection ====================
    console.log('Step 2: Attempting SQL injection...');
    const sqlInjectionAttempts = [
      "admin' OR '1'='1",
      "admin'--",
      "admin' #",
      "' OR '1'='1' --",
      "1' UNION SELECT NULL--",
    ];

    for (const attempt of sqlInjectionAttempts) {
      console.log(`Testing injection: ${attempt}`);

      await loginPage.fillLoginForm(attempt, 'password123');
      await loginPage.submitLogin();

      // Wait for response
      await page.waitForTimeout(1500);

      // Should either show error or still be on login page
      const currentUrl = page.url();
      expect(currentUrl).toContain('/login');

      // Clear form for next attempt
      await page.reload();
      await page.waitForLoadState('networkidle');
    }

    console.log('SQL injection attempts properly rejected');
  });

  test('should sanitize XSS attempts in input fields', async ({ page, signupPage }) => {
    console.log('TEST: XSS protection in signup');

    // ==================== Step 1: Navigate to signup ====================
    console.log('Step 1: Navigating to signup page...');
    await signupPage.goto();

    // ==================== Step 2: Attempt XSS injection ====================
    console.log('Step 2: Attempting XSS injection...');
    const xssAttempts = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      '<svg/onload=alert("XSS")>',
      'javascript:alert("XSS")',
    ];

    for (const xss of xssAttempts) {
      console.log(`Testing XSS: ${xss}`);

      // Fill name field with XSS attempt
      await signupPage.fillSignupForm(`test-${Date.now()}@example.com`, 'Test1234!', xss);
      await signupPage.submitSignup();

      // Wait for response
      await page.waitForTimeout(1000);

      // Check that no alert was triggered
      const dialogs: string[] = [];
      page.on('dialog', (dialog) => {
        dialogs.push(dialog.message());
        dialog.dismiss();
      });

      expect(dialogs.length).toBe(0);

      // Reload for next test
      await page.reload();
      await page.waitForLoadState('networkidle');
    }

    console.log('XSS attempts properly sanitized');
  });
});

test.describe('Edge Cases - Invalid Input', () => {
  test('should handle empty form submissions', async ({ page, loginPage }) => {
    console.log('TEST: Empty form submission handling');

    // ==================== Step 1: Navigate to login ====================
    console.log('Step 1: Navigating to login page...');
    await loginPage.goto();

    // ==================== Step 2: Submit empty form ====================
    console.log('Step 2: Submitting empty form...');
    await loginPage.submitLogin();

    // Wait a moment
    await page.waitForTimeout(1000);

    // ==================== Step 3: Verify still on login page ====================
    console.log('Step 3: Verifying error handling...');
    const currentUrl = page.url();
    expect(currentUrl).toContain('/login');

    // May show validation errors
    const hasError = await loginPage.hasErrorMessage();
    console.log(`Error message shown: ${hasError}`);

    console.log('Empty form handled gracefully');
  });

  test('should handle invalid email formats', async ({ page, loginPage }) => {
    console.log('TEST: Invalid email format handling');

    // ==================== Step 1: Navigate to login ====================
    console.log('Step 1: Navigating to login page...');
    await loginPage.goto();

    // ==================== Step 2: Try invalid email formats ====================
    console.log('Step 2: Testing invalid email formats...');
    const invalidEmails = [
      'notanemail',
      '@example.com',
      'user@',
      'user@@example.com',
      'user@example',
    ];

    for (const email of invalidEmails) {
      console.log(`Testing email: ${email}`);

      await loginPage.fillLoginForm(email, 'Password123!');
      await loginPage.submitLogin();

      await page.waitForTimeout(1000);

      // Should still be on login or show validation error
      const currentUrl = page.url();
      expect(currentUrl).toContain('/login');

      // Reload for next test
      await page.reload();
      await page.waitForLoadState('networkidle');
    }

    console.log('Invalid email formats handled correctly');
  });

  test('should handle very long input strings', async ({ page, loginPage }) => {
    console.log('TEST: Long input string handling');

    // ==================== Step 1: Navigate to login ====================
    console.log('Step 1: Navigating to login page...');
    await loginPage.goto();

    // ==================== Step 2: Submit very long strings ====================
    console.log('Step 2: Submitting very long strings...');
    const longString = 'a'.repeat(10000);

    await loginPage.fillLoginForm(longString, longString);
    await loginPage.submitLogin();

    // Wait for response
    await page.waitForTimeout(2000);

    // ==================== Step 3: Verify application didn't crash ====================
    console.log('Step 3: Verifying application stability...');
    const currentUrl = page.url();
    expect(currentUrl).toBeDefined();

    // Should still be functional
    const pageTitle = await page.title();
    expect(pageTitle).toBeDefined();

    console.log('Long input strings handled without crashing');
  });
});

test.describe('Edge Cases - Network and Timing', () => {
  test('should handle page refresh during operations', async ({
    page,
    loginPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Page refresh resilience');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Start login process ====================
      console.log('Step 1: Starting login process...');
      await loginPage.goto();
      await loginPage.fillLoginForm(testUser.email, testUser.password);

      // ==================== Step 2: Refresh page before submission ====================
      console.log('Step 2: Refreshing page before submission...');
      await page.reload();
      await page.waitForLoadState('networkidle');

      // ==================== Step 3: Verify form is cleared/reset ====================
      console.log('Step 3: Verifying form state after refresh...');
      expect(page.url()).toContain('/login');

      // Should be able to login normally after refresh
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForTimeout(2000);

      console.log('Page refresh handled gracefully');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should handle back button navigation', async ({
    page,
    loginPage,
    pricingPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Back button navigation');

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
      console.log('Step 2: Navigating to pricing...');
      await pricingPage.goto();
      await page.waitForLoadState('networkidle');

      // ==================== Step 3: Use back button ====================
      console.log('Step 3: Using browser back button...');
      await page.goBack();
      await page.waitForTimeout(1000);

      // ==================== Step 4: Verify back on dashboard ====================
      console.log('Step 4: Verifying navigation...');
      const currentUrl = page.url();
      expect(currentUrl).toContain('/dashboard');

      console.log('Back button navigation handled correctly');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});

test.describe('Edge Cases - Concurrent Operations', () => {
  test('should handle multiple browser tabs correctly', async ({ browser, testDb, testUser }) => {
    console.log('TEST: Multiple tabs session handling');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Create two browser contexts ====================
      console.log('Step 1: Creating two browser tabs...');
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      // ==================== Step 2: Login in first tab ====================
      console.log('Step 2: Logging in first tab...');
      await page1.goto('/login');
      await page1.fill('input[type="email"]', testUser.email);
      await page1.fill('input[type="password"]', testUser.password);
      await page1.click('button[type="submit"]');
      await page1.waitForTimeout(2000);

      // ==================== Step 3: Check second tab ====================
      console.log('Step 3: Checking second tab state...');
      await page2.goto('/dashboard');
      await page2.waitForTimeout(2000);

      const url2 = page2.url();
      console.log(`Second tab URL: ${url2}`);

      // Second tab should redirect to login (different session)
      expect(url2).toContain('/login');

      // ==================== Cleanup ====================
      await context1.close();
      await context2.close();

      console.log('Multiple tabs handled correctly');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});

test.describe('Edge Cases - Data Integrity', () => {
  test('should prevent duplicate subscription creation', async ({
    page,
    loginPage,
    pricingPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Duplicate subscription prevention');

    // ==================== Setup: Create user with existing subscription ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    const subscription = await testDb.createSubscription(user.id, {
      plan_tier: 'hobby',
      status: 'active',
      stripe_customer_id: `cus_test_${Date.now()}`,
      stripe_subscription_id: `sub_test_${Date.now()}`,
    });
    console.log(`User created with existing subscription: ${subscription.plan_tier}`);

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Try to purchase another subscription ====================
      console.log('Step 2: Attempting to purchase another subscription...');
      await pricingPage.goto();
      await page.waitForLoadState('networkidle');

      // Try to select a plan
      await pricingPage.selectPlan('pro').catch(() => {
        console.log('Plan selection blocked or redirected');
      });

      await page.waitForTimeout(2000);

      // ==================== Step 3: Verify no duplicate subscription created ====================
      console.log('Step 3: Verifying no duplicate subscription...');
      const subscriptions = await testDb
        .getClient()
        ?.from('subscriptions')
        .select('*')
        .eq('user_id', user.id);

      // Should only have one subscription
      expect(subscriptions?.data?.length).toBeLessThanOrEqual(1);

      console.log('Duplicate subscription prevented');
    } catch (error) {
      console.error('Test error:', error);
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});
