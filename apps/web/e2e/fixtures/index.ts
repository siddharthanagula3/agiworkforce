/* eslint-disable react-hooks/rules-of-hooks */
// Note: This file uses Playwright's `use` function for fixtures, not React hooks
import { test as base, expect } from '@playwright/test';
import {
  SignupPage,
  PricingPage,
  DashboardPage,
  StripePage,
  LoginPage,
  SettingsPage,
  BillingPage,
} from '../page-objects';
import { TestDatabase, StripeHelpers, waitForUrl, pollUntil } from '../utils';

/**
 * Custom fixtures for E2E tests
 * Extends base Playwright test with page objects, database helpers, and test utilities
 */

type Fixtures = {
  signupPage: SignupPage;
  pricingPage: PricingPage;
  dashboardPage: DashboardPage;
  stripePage: StripePage;
  loginPage: LoginPage;
  settingsPage: SettingsPage;
  billingPage: BillingPage;
  testDb: TestDatabase;
  stripeHelpers: StripeHelpers;
  testUser: {
    email: string;
    password: string;
    userId: string | null;
  };
};

/**
 * Extend Playwright test with custom fixtures
 */
export const test = base.extend<Fixtures>({
  /**
   * SignupPage fixture - provides page object for signup interactions
   * Automatically instantiated with the browser page
   */
  signupPage: async ({ page }, use) => {
    await use(new SignupPage(page));
  },

  /**
   * PricingPage fixture - provides page object for pricing page interactions
   * Automatically instantiated with the browser page
   */
  pricingPage: async ({ page }, use) => {
    await use(new PricingPage(page));
  },

  /**
   * DashboardPage fixture - provides page object for dashboard interactions
   * Automatically instantiated with the browser page
   */
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  /**
   * StripePage fixture - provides page object for Stripe checkout interactions
   * Automatically instantiated with the browser page
   */
  stripePage: async ({ page }, use) => {
    await use(new StripePage(page));
  },

  /**
   * LoginPage fixture - provides page object for login interactions
   * Automatically instantiated with the browser page
   */
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  /**
   * SettingsPage fixture - provides page object for settings page interactions
   * Automatically instantiated with the browser page
   */
  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page));
  },

  /**
   * BillingPage fixture - provides page object for billing page interactions
   * Automatically instantiated with the browser page
   */
  billingPage: async ({ page }, use) => {
    await use(new BillingPage(page));
  },

  /**
   * TestDatabase fixture - provides Supabase database helpers for test setup and verification
   * Automatically connects to database and cleans up after test
   */
  testDb: async ({}, use) => {
    const db = new TestDatabase();
    await db.connect();
    await use(db);
    // Cleanup: disconnect from database
    await db.disconnect();
  },

  /**
   * StripeHelpers fixture - provides Stripe test helpers
   * No cleanup needed as it's a stateless helper
   */
  stripeHelpers: async ({}, use) => {
    const helpers = new StripeHelpers();
    await use(helpers);
  },

  /**
   * TestUser fixture - provides test user credentials with auto-cleanup
   * Generates unique email with timestamp and provides default password
   * Automatically cleans up user from database after test
   */
  testUser: async ({ testDb }, use) => {
    // Generate unique email with timestamp to avoid conflicts
    const email = `test-${Date.now()}@example.com`;
    const password = 'Test1234!@#$';
    const userId: string | null = null;

    // Provide test user object to test
    await use({ email, password, userId });

    // Cleanup: delete test user from database if it was created
    if (userId) {
      try {
        await testDb.deleteTestUser(userId);
      } catch (error) {
        console.warn(`Failed to delete test user ${userId}:`, error);
      }
    }
  },
});

/**
 * Export expect from Playwright for assertions in test files
 * Usage: expect(value).toBe(expected)
 */
export { expect };

/**
 * Export utility functions for use in test files
 */
export { waitForUrl, pollUntil };
