import { Page } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * PricingPage represents the pricing page of the application.
 * It extends BasePage and provides methods specific to pricing functionality.
 */
export class PricingPage extends BasePage {
  // Billing interval toggle
  private readonly billingToggle = 'button[class*="rounded-full"][class*="bg-blue-600"]';
  private readonly monthlyLabel = 'span:has-text("Monthly")';
  // private readonly annualLabel = 'span:has-text("Yearly")';

  // Plan cards - using CSS selectors to match h2 text
  // private readonly hobbyPlanCard = 'h2:has-text("Hobby")';
  // private readonly proPlanCard = 'h2:has-text("Pro"):not(:has-text("Power"))';
  // private readonly maxPlanCard = 'h2:has-text("Max")';

  // Button selectors - using locator chain to find within closest div context
  // These will be used with Playwright's filter/first methods in the page object
  private readonly hobbySubscribeButton =
    'button:has-text(/^Subscribe$|^Current Plan$|^Manage Subscription$/)';
  private readonly proUpgradeButton =
    'button:has-text(/^Upgrade|^Current Plan$|^Manage Subscription$/)';
  private readonly maxUpgradeButton =
    'button:has-text(/^Upgrade|^Current Plan$|^Manage Subscription$/)';

  // Grid container for all plan cards
  // private readonly plansGrid = 'div[class*="grid-cols"]';

  private readonly currentPlanBadge = 'button:has-text("Current Plan")';
  private readonly manageButton = 'button:has-text("Manage Subscription")';

  // Pricing information
  private readonly hobbyPrice = 'div:has(h2:has-text("Hobby")) >> div[class*="text-3xl"]';
  private readonly proPrice = 'div:has(h2:has-text("Pro")) >> div[class*="text-3xl"]';
  private readonly maxPrice = 'div:has(h2:has-text("Max")) >> div[class*="text-3xl"]';

  // Plan badges
  private readonly launchOfferBadge = 'div:has-text("Limited Time Launch Offer")';
  private readonly recommendedBadge = 'div:has-text("Recommended")';
  // private readonly powerUserBadge = 'div:has-text("Power User")';

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the pricing page
   */
  override async goto(): Promise<void> {
    await super.goto('/pricing');
  }

  /**
   * Toggle the billing interval between monthly and annual
   * @param interval - The desired interval: 'monthly' or 'annual'
   */
  async toggleBillingInterval(interval: 'monthly' | 'annual'): Promise<void> {
    const billingToggle = this.page.locator(this.billingToggle);
    const toggleElement = billingToggle.first();

    // Get current toggle position to determine current state
    const currentState = await this.getBillingInterval();

    // If the desired state matches current state, no need to toggle
    if (currentState === interval) {
      return;
    }

    // Click the toggle to switch
    await toggleElement.click();
  }

  /**
   * Get the current billing interval
   * @returns The current billing interval: 'monthly' or 'annual'
   */
  async getBillingInterval(): Promise<'monthly' | 'annual'> {
    const monthlyLabel = this.page.locator(this.monthlyLabel).first();
    const monthlyClass = await monthlyLabel.getAttribute('class');

    // Check if monthly label has 'text-white' class (active state)
    if (monthlyClass?.includes('text-white')) {
      return 'monthly';
    }
    return 'annual';
  }

  /**
   * Select a plan by tier name
   * @param tier - The plan tier: 'hobby', 'pro', or 'max'
   */
  async selectPlan(tier: 'hobby' | 'pro' | 'max'): Promise<void> {
    let planName: string;

    switch (tier) {
      case 'hobby':
        planName = 'Hobby';
        break;
      case 'pro':
        planName = 'Pro';
        break;
      case 'max':
        planName = 'Max';
        break;
    }

    // Find the h2 with the plan name
    const planH2 = this.page.locator(`h2:has-text("${planName}")`).first();

    // Navigate up to find the plan card container (the parent div)
    const planCard = planH2.locator('xpath=ancestor::div[@class]').first();

    // Find the button within this plan card
    const button = planCard.locator('button').last();

    await button.click();
  }

  /**
   * Click the Hobby plan subscribe button
   */
  async selectHobbyPlan(): Promise<void> {
    await this.click(this.hobbySubscribeButton);
  }

  /**
   * Click the Pro plan upgrade button
   */
  async selectProPlan(): Promise<void> {
    await this.click(this.proUpgradeButton);
  }

  /**
   * Click the Max plan upgrade button
   */
  async selectMaxPlan(): Promise<void> {
    await this.click(this.maxUpgradeButton);
  }

  /**
   * Get the current plan badge if visible
   * @returns The text of the current plan badge or null if not visible
   */
  async getCurrentPlanBadge(): Promise<string | null> {
    const isVisible = await this.isVisible(this.currentPlanBadge);
    if (isVisible) {
      return await this.getText(this.currentPlanBadge);
    }
    return null;
  }

  /**
   * Check if manage button is visible
   * @returns True if the manage subscription button is visible
   */
  async hasManageButton(): Promise<boolean> {
    return await this.isVisible(this.manageButton);
  }

  /**
   * Click the manage subscription button
   */
  async clickManageButton(): Promise<void> {
    await this.click(this.manageButton);
  }

  /**
   * Get the price for a specific plan
   * @param tier - The plan tier: 'hobby', 'pro', or 'max'
   * @returns The price string
   */
  async getPlanPrice(tier: 'hobby' | 'pro' | 'max'): Promise<string> {
    let priceSelector: string;

    switch (tier) {
      case 'hobby':
        priceSelector = this.hobbyPrice;
        break;
      case 'pro':
        priceSelector = this.proPrice;
        break;
      case 'max':
        priceSelector = this.maxPrice;
        break;
    }

    return await this.getText(priceSelector);
  }

  /**
   * Check if a plan card is visible
   * @param tier - The plan tier: 'hobby', 'pro', 'max', or 'enterprise'
   * @returns True if the plan card is visible
   */
  async isPlanCardVisible(tier: 'hobby' | 'pro' | 'max' | 'enterprise'): Promise<boolean> {
    let planName: string;

    switch (tier) {
      case 'hobby':
        planName = 'Hobby';
        break;
      case 'pro':
        planName = 'Pro';
        break;
      case 'max':
        planName = 'Max';
        break;
      case 'enterprise':
        planName = 'Enterprise';
        break;
    }

    // Just check if the h2 with the plan name is visible
    const planH2 = this.page.locator(`h2:has-text("${planName}")`).first();
    return await planH2.isVisible();
  }

  /**
   * Check if launch offer badge is visible
   * @returns True if the launch offer badge is visible
   */
  async isLaunchOfferBadgeVisible(): Promise<boolean> {
    return await this.isVisible(this.launchOfferBadge);
  }

  /**
   * Check if recommended badge is visible
   * @returns True if the recommended badge is visible
   */
  async isRecommendedBadgeVisible(): Promise<boolean> {
    return await this.isVisible(this.recommendedBadge);
  }

  /**
   * Check if a plan button is disabled
   * @param tier - The plan tier: 'hobby', 'pro', or 'max'
   * @returns True if the button is disabled
   */
  async isPlanButtonDisabled(tier: 'hobby' | 'pro' | 'max'): Promise<boolean> {
    let buttonSelector: string;

    switch (tier) {
      case 'hobby':
        buttonSelector = this.hobbySubscribeButton;
        break;
      case 'pro':
        buttonSelector = this.proUpgradeButton;
        break;
      case 'max':
        buttonSelector = this.maxUpgradeButton;
        break;
    }

    return await this.isDisabled(buttonSelector);
  }

  /**
   * Check if subscription is required message is visible
   * @returns True if the subscription required message is visible
   */
  async isSubscriptionRequiredMessageVisible(): Promise<boolean> {
    return await this.isVisible('h3:has-text("Subscription Required")');
  }
}
