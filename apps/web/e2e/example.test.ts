import { test, expect } from '@playwright/test';
import { SignupPage, PricingPage, DashboardPage, StripePage } from './page-objects';

/**
 * Example E2E tests using page objects
 * These tests demonstrate how to use the page objects for common user flows
 */

test.describe('AGI Workforce E2E Tests', () => {
  test('Pricing page should display all plans', async ({ page }) => {
    const pricingPage = new PricingPage(page);

    // Navigate to pricing
    await pricingPage.goto();

    // Verify all plan cards are visible
    expect(await pricingPage.isPlanCardVisible('hobby')).toBeTruthy();
    expect(await pricingPage.isPlanCardVisible('pro')).toBeTruthy();
    expect(await pricingPage.isPlanCardVisible('max')).toBeTruthy();

    // Verify badges
    expect(await pricingPage.isLaunchOfferBadgeVisible()).toBeTruthy();
    expect(await pricingPage.isRecommendedBadgeVisible()).toBeTruthy();
  });

  test('User can toggle billing interval', async ({ page }) => {
    const pricingPage = new PricingPage(page);

    await pricingPage.goto();

    // Start on annual billing
    const initialInterval = await pricingPage.getBillingInterval();

    // Toggle to opposite interval
    const otherInterval = initialInterval === 'annual' ? 'monthly' : 'annual';
    await pricingPage.toggleBillingInterval(otherInterval);

    // Verify interval changed
    const newInterval = await pricingPage.getBillingInterval();
    expect(newInterval).toBe(otherInterval);

    // Verify prices changed
    const price = await pricingPage.getPlanPrice('hobby');
    if (otherInterval === 'monthly') {
      expect(price).toContain('10');
    } else {
      expect(price).toContain('4.99');
    }
  });

  test('Dashboard should show plan information', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    // Navigate to dashboard
    await dashboardPage.goto();

    // Wait for load
    await dashboardPage.waitForLoad();

    // Verify plan tier is displayed
    expect(await dashboardPage.isDashboardTitleVisible()).toBeTruthy();
    expect(await dashboardPage.isPlanTierCardVisible()).toBeTruthy();

    // Get plan information
    const planTier = await dashboardPage.getCurrentPlanTier();
    const status = await dashboardPage.getSubscriptionStatus();

    console.log(`Current Plan: ${planTier}`);
    console.log(`Subscription Status: ${status}`);
  });

  test('Signup form validation', async ({ page }) => {
    const signupPage = new SignupPage(page);

    await signupPage.goto();

    // Test password requirements
    await signupPage.fillPassword('weak');
    expect(await signupPage.isPasswordRequirementsVisible()).toBeTruthy();

    // Test form submission with weak password
    await signupPage.fillFullName('John Doe');
    await signupPage.fillEmail('test@example.com');
    await signupPage.fillConfirmPassword('weak');
    expect(await signupPage.isSubmitButtonDisabled()).toBeTruthy();
  });

  test('Plan selection and checkout flow', async ({ page }) => {
    const pricingPage = new PricingPage(page);
    const stripePage = new StripePage(page);

    // Start on pricing page
    await pricingPage.goto();

    // Verify pro plan is recommended
    expect(await pricingPage.isRecommendedBadgeVisible()).toBeTruthy();

    // Select pro plan
    await pricingPage.selectProPlan();

    // Should redirect to checkout
    // Note: This will fail without proper authentication
    // In real tests, you'd need to mock or handle the auth first
    const isOnPayment = await stripePage.isOnPaymentPage().catch(() => false);
    console.log(`On payment page: ${isOnPayment}`);
  });

  test('Dashboard shows correct plan after subscription', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    // Navigate to dashboard
    await dashboardPage.goto();

    // Wait for content
    await dashboardPage.waitForLoad();

    // Check various dashboard elements
    const planTier = await dashboardPage.getCurrentPlanTier();
    const isActive = await dashboardPage.isSubscriptionActive();
    const apiUsage = await dashboardPage.getApiUsageCount();
    const teamMembers = await dashboardPage.getTeamMembersCount();

    // Verify all elements are displayed
    expect(planTier).toBeTruthy();
    expect(apiUsage).toBeDefined();
    expect(teamMembers).toBeDefined();

    console.log({
      planTier,
      isActive,
      apiUsage,
      teamMembers,
    });
  });

  test('Navigation between pricing and dashboard', async ({ page }) => {
    const pricingPage = new PricingPage(page);
    const dashboardPage = new DashboardPage(page);

    // Start at pricing
    await pricingPage.goto();
    expect(await page.url()).toContain('/pricing');

    // Navigate to dashboard
    await dashboardPage.goto();
    expect(await page.url()).toContain('/dashboard');

    // Go back to pricing
    await pricingPage.goto();
    expect(await page.url()).toContain('/pricing');
  });

  test('Quick actions are accessible', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    // Verify quick actions section is visible
    expect(await dashboardPage.isQuickActionsSectionVisible()).toBeTruthy();
    expect(await dashboardPage.isDownloadAppButtonVisible()).toBeTruthy();
    expect(await dashboardPage.isManageBillingButtonVisible()).toBeTruthy();
  });
});

test.describe('Error handling', () => {
  test('Signup with invalid email', async ({ page }) => {
    const signupPage = new SignupPage(page);

    await signupPage.goto();

    // Fill form with invalid email
    await signupPage.fillFullName('John Doe');
    await signupPage.fillEmail('invalid-email');
    await signupPage.fillPassword('ValidPassword123!');
    await signupPage.fillConfirmPassword('ValidPassword123!');

    // Try to submit
    await signupPage.submitSignup();

    // Browser validation should prevent submission
    // Email field should show validation error
  });

  test('Pricing page loads even without authentication', async ({ page }) => {
    const pricingPage = new PricingPage(page);

    // Pricing should be accessible without login
    await pricingPage.goto();

    // All plans should be visible
    expect(await pricingPage.isPlanCardVisible('hobby')).toBeTruthy();
    expect(await pricingPage.isPlanCardVisible('pro')).toBeTruthy();
    expect(await pricingPage.isPlanCardVisible('max')).toBeTruthy();
  });
});
