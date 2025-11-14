import { Locator, Page, expect } from '@playwright/test';

/**
 * Proper error handling utilities for tests
 * Replaces silent .catch(() => false) patterns with explicit error handling and logging
 */

export class ErrorHandler {
  constructor(private page?: Page) {}

  /**
   * Safe visibility check with proper error handling and logging
   * @param locator - The element to check
   * @param timeout - Timeout in ms (optional)
   * @returns true if visible, false if not found (with logging)
   */
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

  /**
   * Safe text content retrieval with proper error handling
   * @param locator - The element to get text from
   * @param defaultValue - Default value if element not found
   * @returns Text content or default value
   */
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

  /**
   * Safe attribute retrieval with proper error handling
   * @param locator - The element to get attribute from
   * @param attribute - Attribute name
   * @param defaultValue - Default value if not found
   * @returns Attribute value or default
   */
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

  /**
   * Safe wait for element with timeout handling
   * @param locator - The element to wait for
   * @param timeout - Timeout in ms
   * @returns true if element appeared, false if timeout
   */
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

  /**
   * Safe click action with proper error handling
   * @param locator - The element to click
   * @param options - Click options (maxRetries, retryDelay)
   * @returns true if click succeeded
   */
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

  /**
   * Safe fill action with proper error handling
   * @param locator - The element to fill
   * @param value - Value to fill
   * @returns true if fill succeeded
   */
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

  /**
   * Safe select option with proper error handling
   * @param locator - The select element
   * @param value - Value to select
   * @returns true if select succeeded
   */
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

  /**
   * Safe count of elements with proper error handling
   * @param locator - The element locator
   * @returns Count of elements or 0 if error
   */
  async getElementCount(locator: Locator): Promise<number> {
    try {
      return await locator.count();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Count] Error counting elements: ${errorMsg}`);
      return 0;
    }
  }

  /**
   * Handle optional confirmation dialog with proper logging
   * @param locator - The dialog button locator
   * @param timeout - Timeout for dialog to appear
   * @returns true if dialog was handled, false if didn't appear
   */
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
      return true; // Not appearing is not necessarily an error
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Dialog] Unexpected error handling dialog: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Conditional element action with proper error logging
   * @param locator - The element to check and act on
   * @param action - Action to perform if element is visible
   * @param timeout - Timeout for checking visibility
   * @returns true if action was performed
   */
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

  /**
   * Wait for condition with proper error handling
   * @param condition - Condition to wait for
   * @param timeout - Timeout in ms
   * @param checkInterval - How often to check condition
   * @returns true if condition met, false if timeout
   */
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

  /**
   * Verify element exists and is visible (throws on failure for use in test expectations)
   * @param locator - The element to verify
   * @param timeout - Timeout in ms
   * @param message - Custom error message
   */
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

  /**
   * Verify element is not visible (throws on failure)
   * @param locator - The element to verify
   * @param timeout - Timeout in ms
   * @param message - Custom error message
   */
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

/**
 * Factory function for creating an ErrorHandler instance
 */
export function createErrorHandler(page?: Page): ErrorHandler {
  return new ErrorHandler(page);
}
