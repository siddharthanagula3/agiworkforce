import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { createErrorHandler } from '../utils/error-handler';

export class AGIPage extends BasePage {
  readonly goalInput: Locator;
  readonly submitButton: Locator;
  readonly goalsList: Locator;
  readonly statusFilter: Locator;
  readonly searchInput: Locator;
  readonly resourcePanel: Locator;

  constructor(page: Page) {
    super(page);
    // Use semantic locators with fallback to test IDs
    this.goalInput = page.getByTestId('goal-input').or(page.getByPlaceholder(/goal/i)).first();
    this.submitButton = page
      .getByRole('button', { name: /submit/i })
      .or(page.getByTestId('submit-goal'))
      .first();
    this.goalsList = page.getByTestId('goals-list').or(page.locator('.goals-list')).first();
    this.statusFilter = page
      .getByRole('combobox', { name: /status/i })
      .or(page.getByTestId('status-filter'))
      .first();
    this.searchInput = page
      .getByRole('searchbox')
      .or(page.getByPlaceholder(/search/i))
      .or(page.getByTestId('search-goals'))
      .first();
    this.resourcePanel = page
      .getByTestId('resource-monitor')
      .or(page.locator('.resource-monitor'))
      .first();
  }

  async navigateToAGI() {
    // Use semantic navigation - prefer role-based or text-based locators
    const agiLink = this.page
      .getByRole('link', { name: /agi|goals/i })
      .or(this.page.getByRole('button', { name: /agi|goals/i }))
      .first();
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
    return await this.page.getByTestId('goal-item').count();
  }

  async getGoalStatus(index: number = 0): Promise<string> {
    const goalItem = this.page.getByTestId('goal-item').nth(index);
    const statusBadge = goalItem
      .getByTestId('goal-status')
      .or(goalItem.locator('.status-badge'))
      .first();
    return (await statusBadge.textContent()) || '';
  }

  async viewGoalDetails(index: number = 0) {
    const goalItem = this.page.getByTestId('goal-item').nth(index);
    await goalItem.click();
    const detailsPanel = this.page
      .getByTestId('goal-details')
      .or(this.page.locator('.goal-details'))
      .first();
    await detailsPanel.waitFor({ timeout: 5000 });
  }

  async getStepsCount(): Promise<number> {
    const errorHandler = createErrorHandler(this.page);
    const stepsList = this.page
      .getByTestId('steps-list')
      .or(this.page.locator('.steps-list'))
      .first();
    if (await errorHandler.isElementVisible(stepsList, 2000)) {
      return await errorHandler.getElementCount(
        stepsList.getByRole('listitem').or(stepsList.getByTestId('step-item')),
      );
    }
    return 0;
  }

  async cancelGoal(index: number = 0) {
    const errorHandler = createErrorHandler(this.page);
    const goalItem = this.page.getByTestId('goal-item').nth(index);
    const cancelButton = goalItem
      .getByRole('button', { name: /cancel/i })
      .or(goalItem.getByTestId('cancel-goal'))
      .first();

    if (await errorHandler.isElementVisible(cancelButton)) {
      await errorHandler.safeClick(cancelButton);

      const confirmButton = this.page.getByRole('button', { name: /cancel goal|confirm/i }).first();
      await errorHandler.handleOptionalDialog(confirmButton, 2000);
    }
  }

  async deleteGoal(index: number = 0) {
    const errorHandler = createErrorHandler(this.page);
    const goalItem = this.page.getByTestId('goal-item').nth(index);
    const deleteButton = goalItem
      .getByRole('button', { name: /delete/i })
      .or(goalItem.getByTestId('delete-goal'))
      .first();

    if (await errorHandler.isElementVisible(deleteButton)) {
      await errorHandler.safeClick(deleteButton);

      const confirmButton = this.page.getByRole('button', { name: /delete|confirm/i }).first();
      await errorHandler.handleOptionalDialog(confirmButton, 2000);
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
    const errorHandler = createErrorHandler(this.page);
    const cpuIndicator = this.page
      .getByTestId('cpu-usage')
      .or(this.page.locator('.cpu-usage'))
      .first();
    const memoryIndicator = this.page
      .getByTestId('memory-usage')
      .or(this.page.locator('.memory-usage'))
      .first();

    const cpu = await errorHandler.getTextContent(cpuIndicator, 'N/A');
    const memory = await errorHandler.getTextContent(memoryIndicator, 'N/A');

    return { cpu: cpu || 'N/A', memory: memory || 'N/A' };
  }

  async isResourceWarningVisible(): Promise<boolean> {
    const errorHandler = createErrorHandler(this.page);
    const warning = this.page
      .getByRole('alert')
      .or(this.page.locator('[data-warning="high"]'))
      .or(this.page.locator('.resource-warning'))
      .first();
    return await errorHandler.isElementVisible(warning, 1000);
  }
}
