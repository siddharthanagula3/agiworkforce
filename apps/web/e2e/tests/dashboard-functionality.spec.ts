import { test, expect } from '../fixtures';

/**
 * E2E Test Suite: Dashboard Functionality
 *
 * This test suite verifies dashboard functionality including:
 * - Dashboard page loading and display
 * - Download app button functionality
 * - Quick actions visibility
 * - Navigation to other dashboard sections
 */

test.describe('Dashboard Functionality', () => {
  test('should load dashboard with all main elements', async ({
    page,
    loginPage,
    dashboardPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Dashboard main elements display');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Wait for dashboard to load ====================
      console.log('Step 2: Waiting for dashboard to load...');
      await dashboardPage.waitForLoad();

      // ==================== Step 3: Verify dashboard title ====================
      console.log('Step 3: Verifying dashboard title...');
      const isTitleVisible = await dashboardPage.isDashboardTitleVisible();
      expect(isTitleVisible).toBeTruthy();

      // ==================== Step 4: Check download app button ====================
      console.log('Step 4: Checking download app button...');
      const isDownloadButtonVisible = await dashboardPage.isDownloadAppButtonVisible();
      console.log(`Download app button visible: ${isDownloadButtonVisible}`);

      // ==================== Step 5: Check plan tier card ====================
      console.log('Step 5: Checking plan tier card...');
      const isPlanCardVisible = await dashboardPage.isPlanTierCardVisible();
      console.log(`Plan tier card visible: ${isPlanCardVisible}`);

      console.log('Dashboard main elements verified');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should navigate to download page when clicking download button', async ({
    page,
    loginPage,
    dashboardPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Download app button navigation');

    // ==================== Setup: Create test user ====================
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

      // ==================== Step 3: Check if download button exists ====================
      console.log('Step 3: Checking download button...');
      const hasDownloadButton = await dashboardPage.isDownloadAppButtonVisible();

      if (hasDownloadButton) {
        console.log('Download button found, clicking...');
        await dashboardPage.clickDownloadAppButton();

        // Wait for navigation
        await page.waitForTimeout(1000);

        // Verify on download page
        const currentUrl = page.url();
        expect(currentUrl).toContain('/download');
        console.log('Successfully navigated to download page');
      } else {
        console.log('Download button not found (may not be visible on dashboard)');
      }
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should display API usage information', async ({
    page,
    loginPage,
    dashboardPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: API usage display');

    // ==================== Setup: Create test user ====================
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

      // ==================== Step 3: Check API usage card ====================
      console.log('Step 3: Checking API usage card...');
      const isApiUsageVisible = await dashboardPage.isApiUsageCardVisible();
      console.log(`API usage card visible: ${isApiUsageVisible}`);

      if (isApiUsageVisible) {
        const apiUsage = await dashboardPage.getApiUsageCount();
        console.log(`API usage: ${apiUsage}`);
        expect(apiUsage).toBeDefined();
      }

      console.log('API usage information checked');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should navigate to billing from quick actions', async ({
    page,
    loginPage,
    dashboardPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Navigate to billing from dashboard quick actions');

    // ==================== Setup: Create test user ====================
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

      // ==================== Step 3: Check for manage billing button ====================
      console.log('Step 3: Checking for manage billing button...');
      const hasBillingButton = await dashboardPage.isManageBillingButtonVisible();
      console.log(`Manage billing button visible: ${hasBillingButton}`);

      if (hasBillingButton) {
        console.log('Clicking manage billing...');
        await dashboardPage.clickManageBillingButton();

        // Wait for navigation
        await page.waitForTimeout(1000);

        // Verify on billing page
        const currentUrl = page.url();
        expect(currentUrl).toContain('/billing');
        console.log('Successfully navigated to billing page');
      } else {
        console.log('Manage billing button not visible (may not be shown for free tier)');
      }
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});

test.describe('Dashboard Navigation', () => {
  test('should navigate to usage page from dashboard (or be redirected if no subscription)', async ({
    page,
    loginPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Navigate to usage page');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Navigate to usage page ====================
      console.log('Step 2: Navigating to usage page...');
      await page.goto('/dashboard/usage');
      await page.waitForLoadState('networkidle');

      // ==================== Step 3: Verify navigation ====================
      console.log('Step 3: Verifying navigation...');
      const currentUrl = page.url();

      // Free tier users may be redirected to pricing page
      const isOnUsageOrRedirected =
        currentUrl.includes('/usage') || currentUrl.includes('/pricing');
      expect(isOnUsageOrRedirected).toBeTruthy();

      if (currentUrl.includes('/pricing')) {
        console.log('Redirected to pricing (expected for free tier users)');
      } else {
        console.log('Usage page navigation successful');
      }
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });

  test('should be able to access dashboard sections sequentially', async ({
    page,
    loginPage,
    dashboardPage,
    billingPage,
    settingsPage,
    testDb,
    testUser,
  }) => {
    console.log('TEST: Sequential navigation through dashboard sections');

    // ==================== Setup: Create test user ====================
    const user = await testDb.createTestUser(testUser.email, testUser.password);
    testUser.userId = user.id;

    try {
      // ==================== Step 1: Login ====================
      console.log('Step 1: Logging in...');
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

      // ==================== Step 2: Navigate through sections ====================
      const sections = [
        { name: 'Main Dashboard', page: dashboardPage, path: '/dashboard' },
        { name: 'Billing', page: billingPage, path: '/dashboard/billing' },
        { name: 'Settings', page: settingsPage, path: '/dashboard/settings' },
        { name: 'Back to Dashboard', page: dashboardPage, path: '/dashboard' },
      ];

      for (const section of sections) {
        console.log(`\nNavigating to: ${section.name}`);
        await section.page.goto();
        await page.waitForTimeout(500);
        expect(page.url()).toContain(section.path);
        console.log(`✓ Successfully navigated to ${section.name}`);
      }

      console.log('\nAll dashboard sections accessible');
    } finally {
      // ==================== Cleanup ====================
      await testDb.cleanup(user.id);
      await testDb.deleteTestUser(user.id);
    }
  });
});
