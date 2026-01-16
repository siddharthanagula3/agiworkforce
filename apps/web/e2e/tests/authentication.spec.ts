import { test, expect } from '../fixtures';

/**
 * E2E Test Suite: Authentication
 *
 * This test suite verifies authentication flows including:
 * - User login with valid credentials
 * - Login with invalid credentials
 * - Protected route access without authentication
 * - Session persistence
 * - Logout functionality
 */

test.describe('Authentication', () => {
  test('should login with valid credentials', async ({ page, loginPage, testDb, testUser }) => {
    console.log('TEST: Login with valid credentials');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;
    console.log(`Test user created: ${user.email}`);

    try {
      // ==================== Step 1: Navigate to login page ====================
      console.log('Step 1: Navigating to login page...');
      await loginPage.goto();
      expect(page.url()).toContain('/login');

      // ==================== Step 2: Fill login form ====================
      console.log('Step 2: Filling login form...');
      await loginPage.fillLoginForm(testUser.email, testUser.password);

      // ==================== Step 3: Submit login form ====================
      console.log('Step 3: Submitting login form...');
      await loginPage.submitLogin();

      // ==================== Step 4: Wait for redirect to dashboard ====================
      console.log('Step 4: Waiting for redirect to dashboard...');
      await loginPage.waitForLoginSuccess();

      // ==================== Step 5: Verify we're on dashboard ====================
      console.log('Step 5: Verifying dashboard loaded...');
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });
      expect(page.url()).toContain('/dashboard');

      console.log('Login successful!');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should show error with invalid credentials', async ({ page, loginPage, testUser }) => {
    console.log('TEST: Login with invalid credentials');

    // ==================== Step 1: Navigate to login page ====================
    console.log('Step 1: Navigating to login page...');
    await loginPage.goto();
    expect(page.url()).toContain('/login');

    // ==================== Step 2: Fill form with invalid credentials ====================
    console.log('Step 2: Filling form with invalid credentials...');
    await loginPage.fillLoginForm(testUser.email, 'WrongPassword123!');

    // ==================== Step 3: Submit login form ====================
    console.log('Step 3: Submitting login form...');
    await loginPage.submitLogin();

    // ==================== Step 4: Wait for error message ====================
    console.log('Step 4: Waiting for error message...');
    await page.waitForTimeout(2000); // Give time for error to appear

    // ==================== Step 5: Verify error displayed or still on login page ====================
    console.log('Step 5: Verifying error handling...');
    const currentUrl = page.url();
    const hasError = await loginPage.hasErrorMessage();

    // Either still on login page or error message shown
    const isHandledCorrectly = currentUrl.includes('/login') || hasError;
    expect(isHandledCorrectly).toBeTruthy();

    if (hasError) {
      const errorText = await loginPage.getErrorMessage();
      console.log(`Error message displayed: ${errorText}`);
    } else {
      console.log('Still on login page (login failed as expected)');
    }

    console.log('Invalid credentials handled correctly');
  });

  test('should redirect to login when accessing protected routes without auth', async ({
    page,
    dashboardPage,
  }) => {
    console.log('TEST: Protected route access without authentication');

    // ==================== Step 1: Try to access dashboard without login ====================
    console.log('Step 1: Attempting to access dashboard without authentication...');
    await dashboardPage.goto();

    // ==================== Step 2: Verify redirect to login ====================
    console.log('Step 2: Verifying redirect to login...');
    await page.waitForTimeout(2000); // Wait for redirect
    const currentUrl = page.url();

    // Should be redirected to login
    expect(currentUrl).toContain('/login');
    console.log('Protected route correctly redirected to login');
  });

  test('should maintain session after page refresh', async ({
    page,
    loginPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Session persistence after page refresh');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;
    console.log(`Test user created: ${user.email}`);

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });
      console.log('Logged in successfully');

      // ==================== Step 2: Refresh page ====================
      console.log('Step 2: Refreshing page...');
      await page.reload();
      await page.waitForLoadState('networkidle');

      // ==================== Step 3: Verify still logged in ====================
      console.log('Step 3: Verifying session persisted...');
      const currentUrl = page.url();

      // Should still be on dashboard (not redirected to login)
      expect(currentUrl).toContain('/dashboard');
      console.log('Session persisted correctly after refresh');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should navigate between login and signup pages', async ({ page, loginPage }) => {
    console.log('TEST: Navigation between login and signup');

    // ==================== Step 1: Start on login page ====================
    console.log('Step 1: Navigating to login page...');
    await loginPage.goto();
    expect(page.url()).toContain('/login');

    // ==================== Step 2: Click signup link (if visible) ====================
    console.log('Step 2: Checking for signup link...');
    const hasSignupLink = await loginPage.isVisible('a[href*="signup"]');

    if (hasSignupLink) {
      console.log('Signup link found, clicking...');
      await loginPage.clickSignupLink();

      // Wait for navigation
      await page.waitForTimeout(1000);

      // Should be on signup page
      const currentUrl = page.url();
      expect(currentUrl).toContain('/signup');
      console.log('Successfully navigated to signup page');
    } else {
      console.log('Signup link not found on login page (may be in header or elsewhere)');
    }
  });
});

test.describe('Settings Page', () => {
  test('should display user settings correctly', async ({
    page,
    loginPage,
    settingsPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Settings page display');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;
    console.log(`Test user created: ${user.email}`);

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Navigate to settings ====================
      console.log('Step 2: Navigating to settings page...');
      await settingsPage.goto();
      await settingsPage.waitForLoad();

      // ==================== Step 3: Verify page elements ====================
      console.log('Step 3: Verifying settings page elements...');
      expect(await settingsPage.isPageTitleVisible()).toBeTruthy();
      expect(await settingsPage.isAccountCardVisible()).toBeTruthy();
      expect(await settingsPage.isBillingCardVisible()).toBeTruthy();

      // ==================== Step 4: Verify email displayed correctly ====================
      console.log('Step 4: Verifying email display...');
      const displayedEmail = await settingsPage.getEmail();
      expect(displayedEmail).toBe(testUser.email);

      console.log('Settings page verified successfully');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should navigate from settings to billing', async ({
    page,
    loginPage,
    settingsPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Settings to billing navigation');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Navigate to settings ====================
      console.log('Step 2: Navigating to settings...');
      await settingsPage.goto();
      await settingsPage.waitForLoad();

      // ==================== Step 3: Click "Go to Billing" ====================
      console.log('Step 3: Clicking "Go to Billing"...');
      expect(await settingsPage.isGoToBillingButtonVisible()).toBeTruthy();
      await settingsPage.clickGoToBilling();

      // ==================== Step 4: Verify on billing page ====================
      console.log('Step 4: Verifying billing page loaded...');
      await page.waitForURL(/.*billing.*/, { timeout: 5000 });
      expect(page.url()).toContain('/billing');

      console.log('Navigation to billing successful');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});
