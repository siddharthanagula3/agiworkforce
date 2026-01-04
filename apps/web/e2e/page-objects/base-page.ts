import { Page, expect } from '@playwright/test';

/**
 * BasePage is the parent class for all page objects.
 * It provides common methods for interacting with web pages.
 */
export class BasePage {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to a specific path
   * @param path - The path to navigate to (e.g., '/pricing', '/dashboard')
   */
  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  /**
   * Click an element by selector
   * @param selector - The CSS selector of the element to click
   */
  async click(selector: string): Promise<void> {
    await this.page.locator(selector).click();
  }

  /**
   * Fill an input field with text
   * @param selector - The CSS selector of the input element
   * @param text - The text to fill in
   */
  async fill(selector: string, text: string): Promise<void> {
    await this.page.locator(selector).fill(text);
  }

  /**
   * Get the text content of an element
   * @param selector - The CSS selector of the element
   * @returns The text content of the element
   */
  async getText(selector: string): Promise<string> {
    return (await this.page.locator(selector).textContent()) || '';
  }

  /**
   * Check if an element is visible
   * @param selector - The CSS selector of the element
   * @returns True if the element is visible, false otherwise
   */
  async isVisible(selector: string): Promise<boolean> {
    return await this.page.locator(selector).isVisible();
  }

  /**
   * Wait for an element to be present in the DOM
   * @param selector - The CSS selector of the element
   */
  async waitForSelector(selector: string): Promise<void> {
    await this.page.locator(selector).waitFor({ state: 'attached' });
  }

  /**
   * Wait for the URL to match a pattern or string
   * @param urlPattern - A RegExp pattern or string to match against the URL
   */
  async waitForURL(urlPattern: RegExp | string): Promise<void> {
    await this.page.waitForURL(urlPattern);
  }

  /**
   * Check if an element is disabled
   * @param selector - The CSS selector of the element
   * @returns True if the element is disabled, false otherwise
   */
  async isDisabled(selector: string): Promise<boolean> {
    return await this.page.locator(selector).isDisabled();
  }

  /**
   * Get the value of an input element
   * @param selector - The CSS selector of the input element
   * @returns The value of the input element
   */
  async getValue(selector: string): Promise<string> {
    return await this.page.locator(selector).inputValue();
  }

  /**
   * Clear an input field
   * @param selector - The CSS selector of the input element
   */
  async clear(selector: string): Promise<void> {
    await this.page.locator(selector).clear();
  }

  /**
   * Wait for an element to be visible
   * @param selector - The CSS selector of the element
   */
  async waitForVisible(selector: string): Promise<void> {
    await this.page.locator(selector).waitFor({ state: 'visible' });
  }

  /**
   * Check if an element exists in the DOM
   * @param selector - The CSS selector of the element
   * @returns True if the element exists, false otherwise
   */
  async exists(selector: string): Promise<boolean> {
    const count = await this.page.locator(selector).count();
    return count > 0;
  }
}
