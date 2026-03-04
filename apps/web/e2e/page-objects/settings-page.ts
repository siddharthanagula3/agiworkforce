import { Page } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * SettingsPage represents the settings page of the application.
 * Provides methods for interacting with account settings.
 */
export class SettingsPage extends BasePage {
  // Page title
  private readonly pageTitle = 'h1:has-text("Settings")';

  // Account card - using more specific selectors
  private readonly accountCard =
    '.bg-zinc-900:has-text("Account"):has-text("Manage your personal details")';
  // private readonly emailLabel = 'label:has-text("Email")';
  private readonly emailValue = 'label:has-text("Email") + p';

  // Billing card - using more specific selectors
  private readonly billingCard =
    '.bg-zinc-900:has-text("Billing"):has-text("Manage your subscription")';
  private readonly goToBillingButton = 'a[href="/dashboard/billing"]:has-text("Go to Billing")';

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the settings page
   */
  override async goto(): Promise<void> {
    await super.goto('/dashboard/settings');
  }

  /**
   * Wait for settings page to load
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
   * Check if account card is visible
   */
  async isAccountCardVisible(): Promise<boolean> {
    return await this.isVisible(this.accountCard);
  }

  /**
   * Check if billing card is visible
   */
  async isBillingCardVisible(): Promise<boolean> {
    return await this.isVisible(this.billingCard);
  }

  /**
   * Get the displayed email address
   */
  async getEmail(): Promise<string> {
    return await this.getText(this.emailValue);
  }

  /**
   * Click "Go to Billing" button
   */
  async clickGoToBilling(): Promise<void> {
    await this.click(this.goToBillingButton);
  }

  /**
   * Check if "Go to Billing" button is visible
   */
  async isGoToBillingButtonVisible(): Promise<boolean> {
    return await this.isVisible(this.goToBillingButton);
  }
}
