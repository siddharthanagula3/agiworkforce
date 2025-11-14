import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class AGIPage extends BasePage {
  // Locators
  readonly goalInput: Locator;
  readonly submitButton: Locator;
  readonly goalsList: Locator;
  readonly statusFilter: Locator;
  readonly searchInput: Locator;
  readonly resourcePanel: Locator;

  constructor(page: Page) {
    super(page);
    this.goalInput = page.locator('textarea[placeholder*="goal"], [data-testid="goal-input"]').first();
    this.submitButton = page.locator('button:has-text("Submit"), [data-testid="submit-goal"]').first();
    this.goalsList = page.locator('[data-testid="goals-list"], .goals-list').first();
    this.statusFilter = page.locator('select[name="status"], [data-testid="status-filter"]').first();
    this.searchInput = page.locator('input[placeholder*="Search"], [data-testid="search-goals"]').first();
    this.resourcePanel = page.locator('[data-testid="resource-monitor"], .resource-monitor').first();
  }

  async navigateToAGI() {
    const agiLink = this.page.locator('a[href*="agi"], button:has-text("AGI"), button:has-text("Goals")').first();
    if (await agiLink.isVisible()) {
      await agiLink.click();
      await this.waitForNetworkIdle();
    }
  }

  async submitGoal(description: string) {
    await this.goalInput.waitFor({ state: 'visible' });
    await this.goalInput.fill(description);
    await this.submitButton.click();
    await this.page.waitForTimeout(1000);
  }

  async getGoalsCount(): Promise<number> {
    return await this.page.locator('[data-testid="goal-item"]').count();
  }

  async getGoalStatus(index: number = 0): Promise<string> {
    const goalItem = this.page.locator('[data-testid="goal-item"]').nth(index);
    const statusBadge = goalItem.locator('[data-testid="goal-status"], .status-badge').first();
    return await statusBadge.textContent() || '';
  }

  async viewGoalDetails(index: number = 0) {
    const goalItem = this.page.locator('[data-testid="goal-item"]').nth(index);
    await goalItem.click();
    const detailsPanel = this.page.locator('[data-testid="goal-details"], .goal-details').first();
    await detailsPanel.waitFor({ timeout: 5000 });
  }

  async getStepsCount(): Promise<number> {
    const stepsList = this.page.locator('[data-testid="steps-list"], .steps-list').first();
    if (await stepsList.isVisible({ timeout: 2000 }).catch(() => false)) {
      return await stepsList.locator('li, [data-testid="step-item"]').count();
    }
    return 0;
  }

  async cancelGoal(index: number = 0) {
    const goalItem = this.page.locator('[data-testid="goal-item"]').nth(index);
    const cancelButton = goalItem.locator('button[aria-label*="Cancel"], [data-testid="cancel-goal"]').first();

    if (await cancelButton.isVisible()) {
      await cancelButton.click();

      // Handle confirmation
      const confirmButton = this.page.locator('button:has-text("Cancel Goal"), button:has-text("Confirm")').first();
      if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmButton.click();
      }
    }
  }

  async deleteGoal(index: number = 0) {
    const goalItem = this.page.locator('[data-testid="goal-item"]').nth(index);
    const deleteButton = goalItem.locator('button[aria-label*="Delete"], [data-testid="delete-goal"]').first();

    if (await deleteButton.isVisible()) {
      await deleteButton.click();

      // Handle confirmation
      const confirmButton = this.page.locator('button:has-text("Delete"), button:has-text("Confirm")').first();
      if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmButton.click();
      }
    }
  }

  async filterByStatus(status: string) {
    await this.statusFilter.selectOption(status);
    await this.page.waitForTimeout(500);
  }

  async searchGoals(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(500);
  }

  async getResourceUsage(): Promise<{ cpu: string; memory: string }> {
    const cpuIndicator = this.page.locator('[data-testid="cpu-usage"], .cpu-usage').first();
    const memoryIndicator = this.page.locator('[data-testid="memory-usage"], .memory-usage').first();

    const cpu = await cpuIndicator.textContent().catch(() => 'N/A');
    const memory = await memoryIndicator.textContent().catch(() => 'N/A');

    return { cpu: cpu || 'N/A', memory: memory || 'N/A' };
  }

  async isResourceWarningVisible(): Promise<boolean> {
    const warning = this.page.locator('[data-warning="high"], .resource-warning').first();
    return await warning.isVisible({ timeout: 1000 }).catch(() => false);
  }
}
