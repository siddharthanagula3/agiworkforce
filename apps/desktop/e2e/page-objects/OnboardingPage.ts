import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { createErrorHandler } from '../utils/error-handler';

export class OnboardingPage extends BasePage {
  // Locators
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly skipButton: Locator;
  readonly finishButton: Locator;
  readonly progressIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.nextButton = page
      .locator('button:has-text("Next"), [data-testid="onboarding-next"]')
      .first();
    this.backButton = page
      .locator('button:has-text("Back"), [data-testid="onboarding-back"]')
      .first();
    this.skipButton = page
      .locator('button:has-text("Skip"), [data-testid="onboarding-skip"]')
      .first();
    this.finishButton = page
      .locator(
        'button:has-text("Finish"), button:has-text("Get Started"), [data-testid="onboarding-finish"]',
      )
      .first();
    this.progressIndicator = page
      .locator('[data-testid="onboarding-progress"], .onboarding-progress')
      .first();
  }

  async startOnboarding() {
    const startButton = this.page
      .locator('button:has-text("Start"), button:has-text("Get Started")')
      .first();
    if (await startButton.isVisible()) {
      await startButton.click();
    }
  }

  async clickNext() {
    await this.nextButton.waitFor({ state: 'visible' });
    await this.nextButton.click();
    await this.page.waitForTimeout(500);
  }

  async clickBack() {
    await this.backButton.waitFor({ state: 'visible' });
    await this.backButton.click();
    await this.page.waitForTimeout(500);
  }

  async skipOnboarding() {
    if (await this.skipButton.isVisible()) {
      await this.skipButton.click();
    }
  }

  async finishOnboarding() {
    await this.finishButton.waitFor({ state: 'visible' });
    await this.finishButton.click();
    await this.waitForNetworkIdle();
  }

  async configureAPIKey(provider: string, apiKey: string) {
    // Fill in API key for the specified provider
    const apiKeyInput = this.page
      .locator(`input[name="${provider}-api-key"], [data-testid="${provider}-api-key"]`)
      .first();
    await apiKeyInput.fill(apiKey);
  }

  async selectProvider(provider: 'openai' | 'anthropic' | 'google' | 'ollama') {
    const providerCard = this.page
      .locator(`[data-testid="${provider}-card"], button:has-text("${provider}")`)
      .first();
    if (await providerCard.isVisible()) {
      await providerCard.click();
    }
  }

  async getCurrentStep(): Promise<number> {
    const progressText = await this.progressIndicator.textContent();
    const match = progressText?.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  async isOnboardingComplete(): Promise<boolean> {
    const errorHandler = createErrorHandler(this.page);
    return await errorHandler.isElementVisible(this.finishButton, 2000);
  }

  async completeFullOnboarding(apiKeys: Record<string, string> = {}) {
    const errorHandler = createErrorHandler(this.page);
    await this.startOnboarding();

    // Navigate through steps
    let maxSteps = 5; // Prevent infinite loops
    while (maxSteps > 0) {
      // Check if we're on API key configuration step
      for (const [provider, key] of Object.entries(apiKeys)) {
        const apiKeyInput = this.page
          .locator(`input[name="${provider}-api-key"], [data-testid="${provider}-api-key"]`)
          .first();
        if (await errorHandler.isElementVisible(apiKeyInput, 1000)) {
          await this.configureAPIKey(provider, key);
        }
      }

      // Check if we can finish
      if (await errorHandler.isElementVisible(this.finishButton, 1000)) {
        await this.finishOnboarding();
        break;
      }

      // Otherwise, click next
      if (await errorHandler.isElementVisible(this.nextButton, 1000)) {
        await this.clickNext();
      } else {
        break;
      }

      maxSteps--;
    }
  }
}
