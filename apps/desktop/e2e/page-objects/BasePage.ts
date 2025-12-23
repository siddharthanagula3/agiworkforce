import { Page, Locator } from '@playwright/test';

export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(url: string = '/') {
    await this.page.goto(url);
    await this.page.waitForLoadState('networkidle');
  }

  async waitForSelector(selector: string, timeout: number = 10000) {
    return await this.page.waitForSelector(selector, { timeout });
  }

  async clickByTestId(testId: string) {
    await this.page.click(`[data-testid="${testId}"]`);
  }

  async fillByTestId(testId: string, value: string) {
    await this.page.fill(`[data-testid="${testId}"]`, value);
  }

  async getByTestId(testId: string): Promise<Locator> {
    return this.page.locator(`[data-testid="${testId}"]`);
  }

  async isVisibleByTestId(testId: string, timeout: number = 5000): Promise<boolean> {
    try {
      const element = await this.getByTestId(testId);
      return await element.isVisible({ timeout });
    } catch {
      return false;
    }
  }

  async waitForNetworkIdle() {
    await this.page.waitForLoadState('networkidle');
  }

  async takeScreenshot(name: string) {
    await this.page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });
  }
}
