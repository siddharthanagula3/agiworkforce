import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class AutomationPage extends BasePage {
  // Locators
  readonly refreshButton: Locator;
  readonly windowsList: Locator;
  readonly searchInput: Locator;
  readonly screenshotButton: Locator;
  readonly clickButton: Locator;
  readonly typeButton: Locator;
  readonly recordButton: Locator;
  readonly stopButton: Locator;
  readonly replayButton: Locator;

  constructor(page: Page) {
    super(page);
    this.refreshButton = page.locator('button:has-text("Refresh"), [data-testid="refresh-windows"]').first();
    this.windowsList = page.locator('[data-testid="windows-list"], .windows-list').first();
    this.searchInput = page.locator('input[placeholder*="Search"], [data-testid="element-search"]').first();
    this.screenshotButton = page.locator('button:has-text("Screenshot"), [data-testid="capture-screenshot"]').first();
    this.clickButton = page.locator('button:has-text("Click"), [data-testid="perform-click"]').first();
    this.typeButton = page.locator('button:has-text("Type"), [data-testid="perform-type"]').first();
    this.recordButton = page.locator('button:has-text("Record"), [data-testid="start-recording"]').first();
    this.stopButton = page.locator('button:has-text("Stop"), [data-testid="stop-recording"]').first();
    this.replayButton = page.locator('button:has-text("Replay"), [data-testid="replay-events"]').first();
  }

  async navigateToAutomation() {
    const automationLink = this.page.locator('a[href*="automation"], button:has-text("Automation")').first();
    if (await automationLink.isVisible()) {
      await automationLink.click();
      await this.waitForNetworkIdle();
    }
  }

  async refreshWindows() {
    await this.refreshButton.click();
    await this.page.waitForTimeout(1000);
  }

  async getWindowsCount(): Promise<number> {
    return await this.page.locator('[data-testid="window-item"]').count();
  }

  async searchElements(query: string) {
    await this.searchInput.fill(query);
    const searchButton = this.page.locator('button:has-text("Search"), [data-testid="search-elements"]').first();
    await searchButton.click();
    await this.page.waitForTimeout(1000);
  }

  async captureScreenshot() {
    await this.screenshotButton.click();
    await this.page.waitForTimeout(2000);

    const preview = this.page.locator('[data-testid="screenshot-preview"], .screenshot-preview img').first();
    await preview.waitFor({ timeout: 5000 });
  }

  async performClick(x: number, y: number) {
    const xInput = this.page.locator('input[name="x"], [data-testid="click-x"]').first();
    const yInput = this.page.locator('input[name="y"], [data-testid="click-y"]').first();

    await xInput.fill(x.toString());
    await yInput.fill(y.toString());
    await this.clickButton.click();
  }

  async performType(text: string) {
    const typeInput = this.page.locator('input[placeholder*="Type"], [data-testid="type-text-input"]').first();
    await typeInput.fill(text);
    await this.typeButton.click();
  }

  async startRecording() {
    await this.recordButton.click();
    const indicator = this.page.locator('[data-recording="true"], .recording-indicator').first();
    await indicator.waitFor({ timeout: 3000 });
  }

  async stopRecording() {
    await this.stopButton.click();
    const indicator = this.page.locator('[data-recording="true"], .recording-indicator').first();
    await indicator.waitFor({ state: 'hidden', timeout: 3000 });
  }

  async replayEvents() {
    await this.replayButton.click();
    const indicator = this.page.locator('[data-replaying="true"], .replay-indicator').first();
    await indicator.waitFor({ timeout: 3000 });
    await indicator.waitFor({ state: 'hidden', timeout: 10000 });
  }

  async getRecordedEventsCount(): Promise<number> {
    const eventsList = this.page.locator('[data-testid="recorded-events"], .recorded-events-list').first();
    if (await eventsList.isVisible({ timeout: 1000 }).catch(() => false)) {
      return await eventsList.locator('li, [data-testid="event-item"]').count();
    }
    return 0;
  }
}
