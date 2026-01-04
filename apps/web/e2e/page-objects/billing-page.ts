import { Page } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * BillingPage represents the billing page of the application.
 * Provides methods for managing subscriptions and payments.
 */
export class BillingPage extends BasePage {
  // Page title
  private readonly pageTitle = 'h1:has-text("Billing & Plans")';

  // Subscription card
  private readonly subscriptionCard = '.bg-zinc-900:has-text("Current Subscription")';
  private readonly planTier = 'span.capitalize >> nth=0';

  // Active subscription indicators
  private readonly activeSubscriptionBanner = '.bg-green-900\\/10:has-text("Active Subscription")';
  private readonly activeSubscriptionTitle = 'h4:has-text("Active Subscription")';
  private readonly renewalDate = 'p:has-text("Your plan renews on")';

  // No subscription indicators
  private readonly noSubscriptionBanner = '.bg-blue-900\\/10:has-text("No Active Subscription")';
  private readonly viewPlansButton = 'a[href="/pricing"]:has-text("View Plans")';

  // Management buttons
  private readonly manageBillingButton =
    'button:has-text("Manage Billing"), form[action*="billing-portal"] button';

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the billing page
   */
  async goto(): Promise<void> {
    await super.goto('/dashboard/billing');
  }

  /**
   * Wait for billing page to load
   */
  async waitForLoad(): Promise<void> {
    await this.waitForVisible(this.pageTitle);
  }

  /**
   * Check if page title is visible
   */
  async isPageTitleVisible(): Promise<boolean> {
    return await this.isVisible(this.pageTitle);
  }

  /**
   * Get the current plan tier
   */
  async getPlanTier(): Promise<string> {
    return await this.getText(this.planTier);
  }

  /**
   * Check if active subscription banner is visible
   */
  async hasActiveSubscription(): Promise<boolean> {
    return await this.isVisible(this.activeSubscriptionBanner);
  }

  /**
   * Check if no subscription banner is visible
   */
  async hasNoSubscription(): Promise<boolean> {
    return await this.isVisible(this.noSubscriptionBanner);
  }

  /**
   * Get the renewal date text
   */
  async getRenewalDate(): Promise<string> {
    if (await this.hasActiveSubscription()) {
      return await this.getText(this.renewalDate);
    }
    return '';
  }

  /**
   * Check if "View Plans" button is visible (shown when no active subscription)
   */
  async isViewPlansButtonVisible(): Promise<boolean> {
    return await this.isVisible(this.viewPlansButton);
  }

  /**
   * Click "View Plans" button
   */
  async clickViewPlans(): Promise<void> {
    await this.click(this.viewPlansButton);
  }

  /**
   * Check if "Manage Billing" button is visible (shown when subscription is active)
   */
  async isManageBillingButtonVisible(): Promise<boolean> {
    return await this.isVisible(this.manageBillingButton);
  }

  /**
   * Click "Manage Billing" button
   */
  async clickManageBilling(): Promise<void> {
    await this.click(this.manageBillingButton);
  }

  /**
   * Check if subscription card is visible
   */
  async isSubscriptionCardVisible(): Promise<boolean> {
    return await this.isVisible(this.subscriptionCard);
  }
}
