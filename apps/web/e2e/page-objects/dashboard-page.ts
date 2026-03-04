import { Page } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * DashboardPage represents the dashboard page of the application.
 * It extends BasePage and provides methods specific to dashboard functionality.
 */
export class DashboardPage extends BasePage {
  // Main sections
  private readonly dashboardTitle = 'h1:has-text("Dashboard")';
  private readonly downloadAppButton = 'a.bg-white:has-text("Download App")';

  // Plan tier card - using more specific selectors based on actual HTML
  private readonly planTierCard = '.bg-zinc-900:has-text("Current Plan")';
  private readonly planTierValue = 'text=Current Plan >> .. >> .. >> .text-2xl';
  private readonly planTierStatus = 'text=Current Plan >> .. >> .. >> .text-xs';

  // Subscription status
  // private readonly subscriptionStatusText = 'p:has-text("Active subscription"), p:has-text("Free tier")';

  // API Usage card
  private readonly apiUsageCard = '.bg-zinc-900:has-text("API Usage")';
  private readonly apiUsageValue = 'text=API Usage >> .. >> .. >> .text-2xl';

  // Team Members card
  private readonly teamMembersCard = '.bg-zinc-900:has-text("Team Members")';
  private readonly teamMembersValue = 'text=Team Members >> .. >> .. >> .text-2xl';

  // Quick Actions
  private readonly quickActionsSection = 'text=Quick Actions';
  private readonly manageBillingButton = 'a:has-text("Manage Billing")';

  // Loading states
  // private readonly loadingSpinner = 'div[class*="animate"]';

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the dashboard page
   */
  override async goto(): Promise<void> {
    await super.goto('/dashboard');
  }

  /**
   * Wait for the dashboard to fully load
   */
  async waitForLoad(): Promise<void> {
    await this.waitForVisible(this.dashboardTitle);
    // Don't wait for plan card - it may not always be visible immediately
    // Just wait a bit for the page to settle
    await this.page.waitForTimeout(1000);
  }

  /**
   * Get the current plan tier
   * @returns The plan tier name (e.g., 'Hobby', 'Pro', 'Max', 'Free')
   */
  async getCurrentPlanTier(): Promise<string> {
    return await this.getText(this.planTierValue);
  }

  /**
   * Get the subscription status
   * @returns The subscription status text
   */
  async getSubscriptionStatus(): Promise<string> {
    return await this.getText(this.planTierStatus);
  }

  /**
   * Check if subscription is active
   * @returns True if subscription status contains 'Active subscription'
   */
  async isSubscriptionActive(): Promise<boolean> {
    const status = await this.getSubscriptionStatus();
    return status.toLowerCase().includes('active subscription');
  }

  /**
   * Check if user is on free tier
   * @returns True if plan tier is 'Free'
   */
  async isFreeTier(): Promise<boolean> {
    const planTier = await this.getCurrentPlanTier();
    return planTier.toLowerCase() === 'free';
  }

  /**
   * Get API usage count
   * @returns The API usage number as a string
   */
  async getApiUsageCount(): Promise<string> {
    return await this.getText(this.apiUsageValue);
  }

  /**
   * Get team members count
   * @returns The team members number as a string
   */
  async getTeamMembersCount(): Promise<string> {
    return await this.getText(this.teamMembersValue);
  }

  /**
   * Check if plan tier card is visible
   * @returns True if the card is visible
   */
  async isPlanTierCardVisible(): Promise<boolean> {
    return await this.isVisible(this.planTierCard);
  }

  /**
   * Check if API usage card is visible
   * @returns True if the card is visible
   */
  async isApiUsageCardVisible(): Promise<boolean> {
    return await this.isVisible(this.apiUsageCard);
  }

  /**
   * Check if team members card is visible
   * @returns True if the card is visible
   */
  async isTeamMembersCardVisible(): Promise<boolean> {
    return await this.isVisible(this.teamMembersCard);
  }

  /**
   * Check if quick actions section is visible
   * @returns True if the section is visible
   */
  async isQuickActionsSectionVisible(): Promise<boolean> {
    return await this.isVisible(this.quickActionsSection);
  }

  /**
   * Click the download app button
   */
  async clickDownloadAppButton(): Promise<void> {
    await this.click(this.downloadAppButton);
  }

  /**
   * Click the manage billing button
   */
  async clickManageBillingButton(): Promise<void> {
    await this.click(this.manageBillingButton);
  }

  /**
   * Check if manage billing button is visible
   * @returns True if the button is visible
   */
  async isManageBillingButtonVisible(): Promise<boolean> {
    return await this.isVisible(this.manageBillingButton);
  }

  /**
   * Check if download app button is visible
   * @returns True if the button is visible
   */
  async isDownloadAppButtonVisible(): Promise<boolean> {
    return await this.isVisible(this.downloadAppButton);
  }

  /**
   * Check if dashboard title is visible
   * @returns True if the title is visible
   */
  async isDashboardTitleVisible(): Promise<boolean> {
    return await this.isVisible(this.dashboardTitle);
  }

  /**
   * Get the current plan tier with full text (includes capitalization)
   * @returns The plan tier name exactly as displayed
   */
  async getCurrentPlanTierExact(): Promise<string> {
    const tierText = await this.getText(this.planTierValue);
    return tierText.trim();
  }
}
