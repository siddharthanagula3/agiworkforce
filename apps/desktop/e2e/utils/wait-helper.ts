import { Page } from '@playwright/test';

export class WaitHelper {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async waitForElement(selector: string, timeout: number = 10000) {
    await this.page.waitForSelector(selector, { timeout });
  }

  async waitForText(text: string, timeout: number = 10000) {
    await this.page.waitForSelector(`text=${text}`, { timeout });
  }

  async waitForNetworkIdle(timeout: number = 30000) {
    await this.page.waitForLoadState('networkidle', { timeout });
  }

  async waitForNavigation(timeout: number = 30000) {
    await this.page.waitForLoadState('domcontentloaded', { timeout });
  }

  async waitForAnimation(duration: number = 500) {
    await this.page.waitForTimeout(duration);
  }

  async waitForCondition(
    condition: () => Promise<boolean>,
    options: { timeout?: number; interval?: number } = {}
  ): Promise<void> {
    const timeout = options.timeout || 10000;
    const interval = options.interval || 100;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await this.page.waitForTimeout(interval);
    }

    throw new Error('Condition not met within timeout');
  }

  async waitForLLMResponse(timeout: number = 30000) {
    // Wait for streaming indicator to appear and then disappear
    const streamingIndicator = this.page.locator('[data-streaming="true"], .streaming').first();

    try {
      // Wait for streaming to start
      await streamingIndicator.waitFor({ state: 'visible', timeout: 5000 });
      // Wait for streaming to complete
      await streamingIndicator.waitFor({ state: 'hidden', timeout });
    } catch {
      // If no streaming indicator, wait for response message
      await this.page.locator('[data-role="assistant"]').last().waitFor({ timeout });
    }
  }

  async waitForGoalCompletion(timeout: number = 60000) {
    // Wait for goal status to change to Completed or Failed
    await this.waitForCondition(
      async () => {
        const status = await this.page
          .locator('[data-testid="goal-status"]')
          .first()
          .textContent();
        return status?.match(/Completed|Failed/) !== null;
      },
      { timeout }
    );
  }

  async waitForFileOperation(timeout: number = 10000) {
    // Wait for file operation success indicator
    const successIndicator = this.page.locator('.success-message, [data-status="success"]').first();
    await successIndicator.waitFor({ timeout });
  }

  async waitForAutomationAction(timeout: number = 5000) {
    // Wait for automation action to complete
    await this.page.waitForTimeout(1000); // Base wait
    const successIndicator = this.page.locator('.success, [data-status="success"]').first();

    try {
      await successIndicator.waitFor({ timeout: timeout - 1000 });
    } catch {
      // Some actions may not show explicit success indicator
      console.log('[Wait] Automation action completed without success indicator');
    }
  }

  async retryUntilSuccess<T>(
    action: () => Promise<T>,
    options: { maxRetries?: number; retryDelay?: number } = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await action();
      } catch (error) {
        if (i === maxRetries - 1) {
          throw error;
        }
        console.log(`[Retry] Attempt ${i + 1} failed, retrying in ${retryDelay}ms...`);
        await this.page.waitForTimeout(retryDelay);
      }
    }

    throw new Error('All retry attempts failed');
  }

  async waitForDebounce(duration: number = 500) {
    // Wait for input debounce to complete
    await this.page.waitForTimeout(duration);
  }
}
