import { Locator, Page, expect } from '@playwright/test';

export class ErrorHandler {
  constructor(private page?: Page) {}

  async isElementVisible(locator: Locator, timeout: number = 2000): Promise<boolean> {
    try {
      const isVisible = await locator.isVisible({ timeout });
      return isVisible;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('Timeout') || errorMsg.includes('not found')) {
        console.log(`[ElementVisibility] Element not visible (timeout: ${timeout}ms)`);
        return false;
      }
      console.warn(`[ElementVisibility] Unexpected error checking visibility: ${errorMsg}`);
      return false;
    }
  }

  async getTextContent(locator: Locator, defaultValue: string = 'N/A'): Promise<string> {
    try {
      const text = await locator.textContent();
      return text || defaultValue;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[TextContent] Error getting text content: ${errorMsg}`);
      return defaultValue;
    }
  }

  async getAttribute(
    locator: Locator,
    attribute: string,
    defaultValue: string | null = null,
  ): Promise<string | null> {
    try {
      return await locator.getAttribute(attribute);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Attribute] Error getting attribute '${attribute}': ${errorMsg}`);
      return defaultValue;
    }
  }

  async waitForElement(locator: Locator, timeout: number = 5000): Promise<boolean> {
    try {
      await locator.waitFor({ state: 'visible', timeout });
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('Timeout')) {
        console.log(`[WaitForElement] Element did not appear within ${timeout}ms`);
        return false;
      }
      console.warn(`[WaitForElement] Unexpected error: ${errorMsg}`);
      return false;
    }
  }

  async safeClick(
    locator: Locator,
    options: { maxRetries?: number; retryDelay?: number } = {},
  ): Promise<boolean> {
    const maxRetries = options.maxRetries || 1;
    const retryDelay = options.retryDelay || 500;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await locator.click();
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (attempt < maxRetries - 1) {
          console.log(
            `[Click] Attempt ${attempt + 1} failed, retrying in ${retryDelay}ms: ${errorMsg}`,
          );
          await this.page?.waitForTimeout(retryDelay);
        } else {
          console.warn(`[Click] Failed after ${maxRetries} attempts: ${errorMsg}`);
          return false;
        }
      }
    }
    return false;
  }

  async safeFill(locator: Locator, value: string): Promise<boolean> {
    try {
      await locator.fill(value);
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Fill] Error filling input: ${errorMsg}`);
      return false;
    }
  }

  async safeSelect(locator: Locator, value: string): Promise<boolean> {
    try {
      await locator.selectOption(value);
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Select] Error selecting option '${value}': ${errorMsg}`);
      return false;
    }
  }

  async getElementCount(locator: Locator): Promise<number> {
    try {
      return await locator.count();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Count] Error counting elements: ${errorMsg}`);
      return 0;
    }
  }

  async handleOptionalDialog(locator: Locator, timeout: number = 2000): Promise<boolean> {
    try {
      if (await this.isElementVisible(locator, timeout)) {
        const success = await this.safeClick(locator);
        if (success) {
          console.log('[Dialog] Confirmation dialog handled');
        } else {
          console.warn('[Dialog] Failed to click confirmation dialog');
        }
        return success;
      }
      console.log('[Dialog] No confirmation dialog appeared (expected in some cases)');
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Dialog] Unexpected error handling dialog: ${errorMsg}`);
      return false;
    }
  }

  async conditionalAction(
    locator: Locator,
    action: (loc: Locator) => Promise<void>,
    timeout: number = 2000,
  ): Promise<boolean> {
    try {
      if (await this.isElementVisible(locator, timeout)) {
        await action(locator);
        return true;
      }
      return false;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[ConditionalAction] Error executing conditional action: ${errorMsg}`);
      return false;
    }
  }

  async waitForCondition(
    condition: () => Promise<boolean>,
    timeout: number = 5000,
    checkInterval: number = 100,
  ): Promise<boolean> {
    try {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        if (await condition()) {
          return true;
        }
        if (this.page) {
          await this.page.waitForTimeout(checkInterval);
        }
      }
      console.log(`[Condition] Condition not met within ${timeout}ms`);
      return false;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Condition] Error waiting for condition: ${errorMsg}`);
      return false;
    }
  }

  async expectElementVisible(
    locator: Locator,
    timeout: number = 5000,
    message?: string,
  ): Promise<void> {
    try {
      await expect(locator).toBeVisible({ timeout });
    } catch (error) {
      const errorMsg = message || `Element expected to be visible within ${timeout}ms`;
      console.error(`[ExpectVisible] ${errorMsg}`);
      throw error;
    }
  }

  async expectElementNotVisible(
    locator: Locator,
    timeout: number = 5000,
    message?: string,
  ): Promise<void> {
    try {
      await expect(locator).not.toBeVisible({ timeout });
    } catch (error) {
      const errorMsg = message || `Element expected to NOT be visible within ${timeout}ms`;
      console.error(`[ExpectNotVisible] ${errorMsg}`);
      throw error;
    }
  }
}

export function createErrorHandler(page?: Page): ErrorHandler {
  return new ErrorHandler(page);
}
