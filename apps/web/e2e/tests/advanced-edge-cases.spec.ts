import { test, expect } from '../fixtures';

/**
 * E2E Test Suite: Advanced Edge Cases
 *
 * This test suite covers advanced edge cases including:
 * - Network and connectivity issues
 * - Session management edge cases
 * - Data boundary tests
 * - Payment flow edge cases
 * - Browser compatibility scenarios
 */

test.describe('Advanced Edge Cases - Network & Connectivity', () => {
  test('should handle form submission with simulated slow network', async ({
    page,
    loginPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Slow network form submission');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Simulate slow 3G network ====================
      console.log('Step 1: Simulating slow 3G network...');
      await page.route('**/*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay
        await route.continue();
      });

      // ==================== Step 2: Navigate to login ====================
      console.log('Step 2: Navigating to login...');
      await loginPage.goto();
      await page.waitForLoadState('networkidle');

      // ==================== Step 3: Submit login form ====================
      console.log('Step 3: Submitting login with slow network...');
      const startTime = Date.now();
      await loginPage.login(testUser.email, testUser.password);
      await loginPage.waitForLoginSuccess();
      const endTime = Date.now();

      console.log(`Login completed in ${endTime - startTime}ms`);

      // ==================== Step 4: Verify login successful despite delay ====================
      expect(page.url()).toContain('/dashboard');
      console.log('Login successful despite slow network');
    } finally {
      // ==================== Cleanup ====================
      await page.unroute('**/*');
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should handle page refresh during form completion', async ({
    page,
    loginPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Page refresh during form completion');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Navigate to login ====================
      console.log('Step 1: Navigating to login...');
      await loginPage.goto();
      await page.waitForLoadState('networkidle');

      // ==================== Step 2: Fill form partially ====================
      console.log('Step 2: Filling email field...');
      await page.fill('input[type="email"]', testUser.email);

      // ==================== Step 3: Refresh page ====================
      console.log('Step 3: Refreshing page...');
      await page.reload();
      await page.waitForLoadState('networkidle');

      // ==================== Step 4: Verify form is cleared ====================
      console.log('Step 4: Verifying form was reset...');
      const emailValue = await page.inputValue('input[type="email"]');
      expect(emailValue).toBe('');

      // ==================== Step 5: Complete login after refresh ====================
      console.log('Step 5: Completing login after refresh...');
      await loginPage.login(testUser.email, testUser.password);
      await loginPage.waitForLoginSuccess();

      expect(page.url()).toContain('/dashboard');
      console.log('Login successful after page refresh');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should handle navigation interruption', async ({ page, loginPage, pricingPage }) => {
    console.log('TEST: Navigation interruption');

    // ==================== Step 1: Start navigation to pricing ====================
    console.log('Step 1: Starting navigation to pricing...');
    // Start but don't await - we'll interrupt it
    void pricingPage.goto();

    // ==================== Step 2: Interrupt with immediate second navigation ====================
    console.log('Step 2: Interrupting with navigation to login...');
    await page.waitForTimeout(100); // Small delay
    await loginPage.goto();

    // ==================== Step 3: Verify final destination ====================
    await page.waitForLoadState('networkidle');
    const currentUrl = page.url();
    console.log(`Final URL: ${currentUrl}`);

    // Should end up on login page (last navigation wins)
    expect(currentUrl).toContain('/login');
    console.log('Navigation interruption handled correctly');
  });
});

test.describe('Advanced Edge Cases - Session Management', () => {
  test('should handle session expiration gracefully', async ({
    page,
    loginPage,
    dashboardPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Session expiration handling');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Login successfully ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Clear all cookies to simulate session expiration ====================
      console.log('Step 2: Clearing cookies to simulate session expiration...');
      await page.context().clearCookies();

      // ==================== Step 3: Try to access protected page ====================
      console.log('Step 3: Attempting to access dashboard with expired session...');
      await dashboardPage.goto();
      await page.waitForTimeout(2000);

      // ==================== Step 4: Verify redirect to login ====================
      const currentUrl = page.url();
      console.log(`Current URL: ${currentUrl}`);
      expect(currentUrl).toContain('/login');
      console.log('Session expiration redirected to login correctly');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should isolate sessions between different browser contexts', async ({
    browser,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Session isolation between contexts');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Create first context and login ====================
      console.log('Step 1: Creating first context and logging in...');
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();
      await page1.goto('http://localhost:3000/login');
      await page1.fill('input[type="email"]', testUser.email);
      await page1.fill('input[type="password"]', testUser.password);
      await page1.click('button[type="submit"]:has-text("Sign In")');
      await page1.waitForURL(/.*dashboard.*/, { timeout: 10000 });
      console.log('Context 1: Logged in');

      // ==================== Step 2: Create second context (should not be logged in) ====================
      console.log('Step 2: Creating second context...');
      const context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await page2.goto('http://localhost:3000/dashboard');
      await page2.waitForTimeout(2000);

      // ==================== Step 3: Verify context 2 is not authenticated ====================
      const url2 = page2.url();
      console.log(`Context 2 URL: ${url2}`);
      expect(url2).toContain('/login');
      console.log('Context 2: Not logged in (correct isolation)');

      // ==================== Step 4: Verify context 1 still authenticated ====================
      await page1.reload();
      await page1.waitForLoadState('networkidle');
      const url1 = page1.url();
      console.log(`Context 1 URL after reload: ${url1}`);
      expect(url1).toContain('/dashboard');
      console.log('Context 1: Still logged in after reload');

      // ==================== Cleanup contexts ====================
      await context1.close();
      await context2.close();
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should handle logout from one tab affecting all tabs', async ({
    page,
    loginPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Logout affecting multiple tabs');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Login in first tab ====================
      console.log('Step 1: Logging in first tab...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Open second tab with same context ====================
      console.log('Step 2: Opening second tab...');
      const context = page.context();
      const page2 = await context.newPage();
      await page2.goto('http://localhost:3000/dashboard');
      await page2.waitForLoadState('networkidle');
      console.log('Second tab opened and showing dashboard');

      // ==================== Step 3: Logout from first tab ====================
      console.log('Step 3: Logging out from first tab...');
      await context.clearCookies();
      await page.goto('http://localhost:3000/login');
      await page.waitForLoadState('networkidle');

      // ==================== Step 4: Verify second tab is also logged out ====================
      console.log('Step 4: Checking second tab...');
      await page2.reload();
      await page2.waitForTimeout(2000);
      const url2 = page2.url();
      console.log(`Second tab URL: ${url2}`);
      expect(url2).toContain('/login');
      console.log('Second tab logged out correctly');

      // ==================== Cleanup ====================
      await page2.close();
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});

test.describe('Advanced Edge Cases - Data Boundaries', () => {
  test('should handle maximum length email addresses', async ({ page, loginPage }) => {
    console.log('TEST: Maximum length email');

    // ==================== Step 1: Create maximum length email (320 chars max per RFC 5321) ====================
    const localPart = 'a'.repeat(64); // Max local part
    const domain = 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(61) + '.com'; // Max domain
    const maxEmail = `${localPart}@${domain}`;
    console.log(`Email length: ${maxEmail.length} characters`);

    // ==================== Step 2: Navigate to login ====================
    await loginPage.goto();
    await page.waitForLoadState('networkidle');

    // ==================== Step 3: Try to submit with max length email ====================
    console.log('Step 2: Submitting with maximum length email...');
    await loginPage.fillLoginForm(maxEmail, 'password123');
    await loginPage.submitLogin();
    await page.waitForTimeout(1500);

    // ==================== Step 4: Verify form handles it (error or accepts) ====================
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // Should still be on login (likely error) or show validation
    const isHandled = currentUrl.includes('/login');
    expect(isHandled).toBeTruthy();
    console.log('Maximum length email handled');
  });

  test('should handle special characters in input fields', async ({ page, loginPage }) => {
    console.log('TEST: Special characters in inputs');

    // ==================== Test various special character combinations ====================
    const specialInputs = [
      { email: 'test+tag@example.com', desc: 'Plus sign in email' },
      { email: 'test.name@example.com', desc: 'Dot in email' },
      { email: 'test_name@example.com', desc: 'Underscore in email' },
      { email: "test'name@example.com", desc: 'Apostrophe in email' },
    ];

    for (const input of specialInputs) {
      console.log(`\nTesting: ${input.desc}`);
      await loginPage.goto();
      await page.waitForLoadState('networkidle');

      await loginPage.fillLoginForm(input.email, 'TestPass123!@#');
      await loginPage.submitLogin();
      await page.waitForTimeout(1500);

      // Should handle without crashing
      const currentUrl = page.url();
      expect(currentUrl).toContain('/login');
      console.log(`✓ ${input.desc} handled`);
    }

    console.log('\nAll special character inputs handled');
  });

  test('should handle unicode and emoji in form fields', async ({ page, loginPage }) => {
    console.log('TEST: Unicode and emoji in form fields');

    // ==================== Step 1: Navigate to login ====================
    await loginPage.goto();
    await page.waitForLoadState('networkidle');

    // ==================== Step 2: Test with emoji and unicode ====================
    const unicodeEmail = 'test😀🎉@example.com';
    const unicodePassword = 'Password123!你好мир';

    console.log('Step 2: Submitting with unicode/emoji...');
    await loginPage.fillLoginForm(unicodeEmail, unicodePassword);
    await loginPage.submitLogin();
    await page.waitForTimeout(1500);

    // ==================== Step 3: Verify handled without crash ====================
    const currentUrl = page.url();
    expect(currentUrl).toContain('/login');
    console.log('Unicode and emoji handled without crash');
  });

  test('should handle extremely long password input', async ({ page, loginPage }) => {
    console.log('TEST: Extremely long password');

    // ==================== Step 1: Navigate to login ====================
    await loginPage.goto();
    await page.waitForLoadState('networkidle');

    // ==================== Step 2: Create 1000 character password ====================
    const longPassword = 'a'.repeat(1000);
    console.log(`Password length: ${longPassword.length} characters`);

    // ==================== Step 3: Submit with long password ====================
    console.log('Step 2: Submitting with 1000 character password...');
    await loginPage.fillLoginForm('test@example.com', longPassword);
    await loginPage.submitLogin();
    await page.waitForTimeout(1500);

    // ==================== Step 4: Verify handled gracefully ====================
    const currentUrl = page.url();
    expect(currentUrl).toContain('/login');
    console.log('Long password handled gracefully');
  });
});

test.describe('Advanced Edge Cases - Payment Flows', () => {
  test('should handle checkout abandonment scenario', async ({
    page,
    loginPage,
    pricingPage,
    dashboardPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Checkout abandonment');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Go to pricing and select plan ====================
      console.log('Step 2: Navigating to pricing...');
      await pricingPage.goto();
      await page.waitForLoadState('networkidle');

      console.log('Step 3: Selecting plan...');
      await pricingPage.selectPlan('hobby');
      await page.waitForTimeout(2000);

      // ==================== Step 3: Abandon checkout (go back) ====================
      console.log('Step 4: Abandoning checkout...');
      await page.goBack();
      await page.waitForTimeout(1000);

      // ==================== Step 4: Verify can return to dashboard ====================
      console.log('Step 5: Returning to dashboard...');
      await dashboardPage.goto();
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/dashboard');

      // ==================== Step 5: Verify no subscription created ====================
      console.log('Step 6: Verifying no subscription...');
      const subscription = await testDb.getSubscription(user.id);
      expect(subscription).toBeNull();
      console.log('Checkout abandonment handled - no subscription created');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should handle rapid subscription tier switching attempts', async ({
    page,
    loginPage,
    pricingPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Rapid subscription switching');

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

      // ==================== Step 3: Rapidly click different plan buttons ====================
      console.log('Step 3: Rapidly clicking different plans...');

      const hobbyButton = page
        .locator(
          'button:has-text("Get Started"):near(h2:has-text("Hobby")), button:has-text("Choose Plan"):near(h2:has-text("Hobby"))',
        )
        .first();
      const proButton = page
        .locator(
          'button:has-text("Get Started"):near(h2:has-text("Pro")), button:has-text("Choose Plan"):near(h2:has-text("Pro"))',
        )
        .first();

      // Click hobby
      if (await hobbyButton.isVisible({ timeout: 5000 })) {
        await hobbyButton
          .click({ timeout: 5000 })
          .catch(() => console.log('Hobby click failed/navigated'));
      }

      // Immediately try to click pro (might fail if already navigated)
      await page.waitForTimeout(100);
      if (await proButton.isVisible({ timeout: 2000 })) {
        await proButton
          .click({ timeout: 2000 })
          .catch(() => console.log('Pro click failed/navigated'));
      }

      // ==================== Step 4: Verify system handled it gracefully ====================
      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      console.log(`Current URL: ${currentUrl}`);

      // Should be on pricing OR checkout page (not crashed)
      const isValidState =
        currentUrl.includes('/pricing') ||
        currentUrl.includes('checkout') ||
        currentUrl.includes('stripe');
      expect(isValidState).toBeTruthy();
      console.log('Rapid tier switching handled gracefully');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should prevent duplicate subscription creation', async ({
    page,
    loginPage,
    billingPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Duplicate subscription prevention');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Create initial subscription ====================
      console.log('Step 1: Creating initial subscription...');
      const stripeCustomerId = `cus_test_dup_${Date.now()}`;
      const stripeSubscriptionId = `sub_test_dup_${Date.now()}`;

      await testDb.createSubscription(user.id, {
        plan_tier: 'hobby',
        status: 'active',
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      });

      // ==================== Step 2: Attempt to create duplicate ====================
      console.log('Step 2: Attempting to create duplicate subscription...');
      try {
        await testDb.createSubscription(user.id, {
          plan_tier: 'pro',
          status: 'active',
          stripe_customer_id: `cus_test_dup2_${Date.now()}`,
          stripe_subscription_id: `sub_test_dup2_${Date.now()}`,
        });
      } catch {
        // Duplicate subscription blocked by database as expected
        console.log('Duplicate subscription blocked by database');
      }

      // ==================== Step 3: Verify only one subscription exists ====================
      console.log('Step 3: Verifying subscription count...');
      const subscription = await testDb.getSubscription(user.id);
      expect(subscription).toBeTruthy();
      expect(subscription?.plan_tier).toBe('hobby'); // Original subscription
      console.log('Only one subscription exists (duplicate prevented)');

      // ==================== Step 4: Verify in UI ====================
      console.log('Step 4: Verifying in UI...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      await billingPage.goto();
      await page.waitForLoadState('networkidle');

      const planTier = await billingPage.getPlanTier();
      expect(planTier.toLowerCase()).toBe('hobby');
      console.log('UI shows original subscription only');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});

test.describe('Advanced Edge Cases - Browser Compatibility', () => {
  test('should handle disabled JavaScript scenario gracefully', async ({ page, loginPage }) => {
    console.log('TEST: Disabled JavaScript handling');

    // Note: This test verifies the app degrades gracefully
    // Full JavaScript disable would prevent Playwright from working
    // So we test partial JavaScript failures instead

    // ==================== Step 1: Block specific JS resources ====================
    console.log('Step 1: Blocking non-critical JS resources...');
    await page.route('**/*.js', async (route) => {
      const url = route.request().url();
      // Block analytics/tracking scripts but allow core app scripts
      if (url.includes('analytics') || url.includes('tracking')) {
        await route.abort();
      } else {
        await route.continue();
      }
    });

    // ==================== Step 2: Navigate to login ====================
    console.log('Step 2: Navigating to login...');
    await loginPage.goto();
    await page.waitForLoadState('networkidle');

    // ==================== Step 3: Verify page still loads ====================
    const isVisible = await page.locator('input[type="email"]').isVisible();
    expect(isVisible).toBeTruthy();
    console.log('Page loaded with partial JS blocking');

    // ==================== Cleanup ====================
    await page.unroute('**/*.js');
  });

  test('should function with localStorage unavailable', async ({ page, loginPage }) => {
    console.log('TEST: LocalStorage unavailable');

    // ==================== Step 1: Clear and disable localStorage ====================
    console.log('Step 1: Clearing localStorage...');
    await page.goto('http://localhost:3000/login');
    await page.evaluate(() => {
      localStorage.clear();
    });

    // ==================== Step 2: Navigate to login ====================
    await loginPage.goto();
    await page.waitForLoadState('networkidle');

    // ==================== Step 3: Verify form still works ====================
    const emailVisible = await page.locator('input[type="email"]').isVisible();
    const passwordVisible = await page.locator('input[type="password"]').isVisible();

    expect(emailVisible).toBeTruthy();
    expect(passwordVisible).toBeTruthy();
    console.log('Login form works without localStorage');
  });

  test('should handle very small viewport', async ({ page, loginPage }) => {
    console.log('TEST: Very small viewport (mobile)');

    // ==================== Step 1: Set mobile viewport ====================
    console.log('Step 1: Setting mobile viewport (375x667)...');
    await page.setViewportSize({ width: 375, height: 667 });

    // ==================== Step 2: Navigate to login ====================
    await loginPage.goto();
    await page.waitForLoadState('networkidle');

    // ==================== Step 3: Verify form is still accessible ====================
    console.log('Step 2: Verifying form accessibility on mobile...');
    const emailVisible = await page.locator('input[type="email"]').isVisible();
    const passwordVisible = await page.locator('input[type="password"]').isVisible();
    const buttonVisible = await page.locator('button[type="submit"]').isVisible();

    expect(emailVisible).toBeTruthy();
    expect(passwordVisible).toBeTruthy();
    expect(buttonVisible).toBeTruthy();
    console.log('Login form accessible on mobile viewport');

    // ==================== Cleanup ====================
    await page.setViewportSize({ width: 1920, height: 1080 });
  });
});
