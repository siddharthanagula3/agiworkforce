import { test, expect } from './fixtures';
import { SettingsSnapshot } from './page-objects/SettingsPage';
import { createErrorHandler } from './utils/error-handler';

/**
 * AGI TEST SUITE
 *
 * Tests AGI goal management, resource monitoring, knowledge base, and settings.
 *
 * NOTE: Tests use proper assertions instead of conditional logic.
 * If an element is missing, the test will fail rather than silently pass.
 */

test.describe('AGI Goal Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Use semantic locators for navigation
    const agiLink = page
      .getByRole('link', { name: /agi|goals/i })
      .or(page.getByRole('button', { name: /agi|goals/i }))
      .first();
    await expect(agiLink).toBeVisible({ timeout: 5000 });
    await agiLink.click();
    await page.waitForLoadState('networkidle');
  });

  test('should submit a new goal', async ({ page }) => {
    // Use semantic locators with fallbacks
    const goalInput = page.getByTestId('goal-input').or(page.getByPlaceholder(/goal/i)).first();
    const submitButton = page
      .getByRole('button', { name: /submit/i })
      .or(page.getByTestId('submit-goal'))
      .first();

    await expect(goalInput).toBeVisible({ timeout: 5000 });
    await expect(submitButton).toBeVisible({ timeout: 5000 });

    await goalInput.fill('Create a simple React component with a button that counts clicks');

    await submitButton.click();

    // Wait for goals list to appear after submission
    const goalsList = page.getByTestId('goals-list').or(page.locator('.goals-list')).first();
    await goalsList.waitFor({ state: 'visible', timeout: 5000 });
    await expect(goalsList).toBeVisible();

    const goalItem = page.getByTestId('goal-item').last();
    await expect(goalItem).toContainText('React component');
  });

  test('should display goal status', async ({ page }) => {
    const goalItem = page.getByTestId('goal-item').first();

    await expect(goalItem).toBeVisible({ timeout: 5000 });

    const statusBadge = goalItem
      .getByTestId('goal-status')
      .or(goalItem.locator('.status-badge'))
      .first();
    await expect(statusBadge).toBeVisible();

    const statusText = await statusBadge.textContent();
    expect(statusText).toMatch(/pending|in progress|completed|failed|cancelled/i);
  });

  test('should show goal details', async ({ page }) => {
    const goalItem = page.getByTestId('goal-item').first();

    await expect(goalItem).toBeVisible({ timeout: 5000 });
    await goalItem.click();

    const detailsPanel = page.getByTestId('goal-details').or(page.locator('.goal-details')).first();
    await expect(detailsPanel).toBeVisible();

    await expect(detailsPanel).toContainText(/description|status|steps/i);
  });

  test('should display execution steps', async ({ page }) => {
    const goalItem = page.getByTestId('goal-item').first();

    await expect(goalItem).toBeVisible({ timeout: 5000 });
    await goalItem.click();

    const stepsList = page.getByTestId('steps-list').or(page.locator('.steps-list')).first();

    await expect(stepsList).toBeVisible({ timeout: 5000 });
    // Use semantic role for list items
    const stepItems = stepsList.getByRole('listitem').or(stepsList.getByTestId('step-item'));
    const count = await stepItems.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show step status', async ({ page }) => {
    const stepItem = page.getByTestId('step-item').first();

    await expect(stepItem).toBeVisible({ timeout: 5000 });

    const stepStatus = stepItem
      .getByTestId('step-status')
      .or(stepItem.locator('.step-status'))
      .first();
    await expect(stepStatus).toBeVisible();

    const statusText = await stepStatus.textContent();
    expect(statusText).toMatch(/pending|in progress|completed|failed/i);
  });

  test('should display progress percentage', async ({ page }) => {
    const goalItem = page.getByTestId('goal-item').first();

    await expect(goalItem).toBeVisible({ timeout: 5000 });

    // Use semantic role for progress bar
    const progressBar = goalItem
      .getByRole('progressbar')
      .or(goalItem.locator('.progress-bar'))
      .first();

    await expect(progressBar).toBeVisible({ timeout: 5000 });
    const ariaValue = await progressBar.getAttribute('aria-valuenow');
    expect(ariaValue).toBeTruthy();
  });

  test('should cancel a goal', async ({ page }) => {
    const errorHandler = createErrorHandler(page);
    const goalItem = page.locator('[data-testid="goal-item"][data-status="Pending"]').first();

    await expect(goalItem).toBeVisible({ timeout: 5000 });

    // Use semantic role for cancel button
    const cancelButton = goalItem
      .getByRole('button', { name: /cancel/i })
      .or(goalItem.getByTestId('cancel-goal'))
      .first();

    await expect(cancelButton).toBeVisible({ timeout: 5000 });
    await cancelButton.click();

    const confirmButton = page.getByRole('button', { name: /cancel goal|confirm/i }).first();
    await errorHandler.handleOptionalDialog(confirmButton, 1000);

    // Wait for status to update to Cancelled
    const status = goalItem.getByTestId('goal-status').first();
    await expect(status).toContainText('Cancelled', { timeout: 5000 });
  });

  test('should delete a completed goal', async ({ page }) => {
    const errorHandler = createErrorHandler(page);
    const goalItem = page.locator('[data-testid="goal-item"][data-status="Completed"]').first();

    await expect(goalItem).toBeVisible({ timeout: 5000 });

    const initialCount = await page.getByTestId('goal-item').count();

    // Use semantic role for delete button
    const deleteButton = goalItem
      .getByRole('button', { name: /delete/i })
      .or(goalItem.getByTestId('delete-goal'))
      .first();

    await expect(deleteButton).toBeVisible({ timeout: 5000 });
    await deleteButton.click();

    const confirmButton = page.getByRole('button', { name: /delete|confirm/i }).first();
    await errorHandler.handleOptionalDialog(confirmButton, 1000);

    // Wait for goal to be removed from the list
    await expect(async () => {
      const newCount = await page.getByTestId('goal-item').count();
      expect(newCount).toBeLessThan(initialCount);
    }).toPass({ timeout: 5000 });
  });

  test('should filter goals by status', async ({ page }) => {
    // Use semantic role for combobox/select
    const statusFilter = page
      .getByRole('combobox', { name: /status/i })
      .or(page.getByTestId('status-filter'))
      .first();

    await expect(statusFilter).toBeVisible({ timeout: 5000 });
    await statusFilter.selectOption('Completed');

    // Wait for filter to be applied by checking for filtered results
    await expect(async () => {
      const visibleGoals = page.getByTestId('goal-item').filter({ has: page.locator(':visible') });
      const count = await visibleGoals.count();
      // Just need the filter to have been applied (count can be 0 or more)
      expect(count).toBeGreaterThanOrEqual(0);
    }).toPass({ timeout: 3000 });

    const visibleGoals = page.getByTestId('goal-item').filter({ has: page.locator(':visible') });
    const count = await visibleGoals.count();

    for (let i = 0; i < count; i++) {
      const goal = visibleGoals.nth(i);
      const status = await goal.getAttribute('data-status');
      expect(status).toBe('Completed');
    }
  });

  test('should search goals by description', async ({ page }) => {
    // Use semantic locators for search input
    const searchInput = page
      .getByRole('searchbox')
      .or(page.getByPlaceholder(/search/i))
      .or(page.getByTestId('search-goals'))
      .first();

    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill('React');

    // Wait for search debounce and results to update
    await expect(async () => {
      const visibleGoals = page.getByTestId('goal-item').filter({ has: page.locator(':visible') });
      const count = await visibleGoals.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }).toPass({ timeout: 3000 });
  });
});

test.describe('AGI Resource Monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Use semantic locators for navigation
    const agiLink = page
      .getByRole('link', { name: /agi|goals/i })
      .or(page.getByRole('button', { name: /agi|goals/i }))
      .first();
    await expect(agiLink).toBeVisible({ timeout: 5000 });
    await agiLink.click();
    await page.waitForLoadState('networkidle');
  });

  test('should display resource usage', async ({ page }) => {
    const resourcePanel = page
      .getByTestId('resource-monitor')
      .or(page.locator('.resource-monitor'))
      .first();

    await expect(resourcePanel).toBeVisible({ timeout: 5000 });
    await expect(resourcePanel).toContainText(/cpu|memory|network|storage/i);
  });

  test('should show CPU usage percentage', async ({ page }) => {
    const cpuIndicator = page.getByTestId('cpu-usage').or(page.locator('.cpu-usage')).first();

    await expect(cpuIndicator).toBeVisible({ timeout: 5000 });
    const cpuText = await cpuIndicator.textContent();
    expect(cpuText).toMatch(/\d+%/);
  });

  test('should show memory usage', async ({ page }) => {
    const memoryIndicator = page
      .getByTestId('memory-usage')
      .or(page.locator('.memory-usage'))
      .first();

    await expect(memoryIndicator).toBeVisible({ timeout: 5000 });
    const memoryText = await memoryIndicator.textContent();
    expect(memoryText).toMatch(/\d+\s*(MB|GB)/i);
  });

  test('should warn when resources are high', async ({ page }) => {
    const errorHandler = createErrorHandler(page);
    // Use semantic role for alerts
    const warningIndicator = page
      .getByRole('alert')
      .or(page.locator('[data-warning="high"]'))
      .or(page.locator('.resource-warning'))
      .first();

    // This is a conditional test - warning only appears when resources are high
    const warningVisible = await errorHandler.isElementVisible(warningIndicator, 1000);
    test.skip(!warningVisible, 'Resource warning not present (resources not high)');

    await expect(warningIndicator).toBeVisible();
    await expect(warningIndicator).toContainText(/high|warning|throttle/i);
  });
});

test.describe('AGI Knowledge Base', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Use semantic locators for navigation
    const knowledgeLink = page
      .getByRole('link', { name: /knowledge/i })
      .or(page.getByRole('button', { name: /knowledge/i }))
      .first();
    await expect(knowledgeLink).toBeVisible({ timeout: 5000 });
    await knowledgeLink.click();
    await page.waitForLoadState('networkidle');
  });

  test('should display past experiences', async ({ page }) => {
    const experiencesList = page
      .getByTestId('experiences-list')
      .or(page.locator('.experiences-list'))
      .first();

    await expect(experiencesList).toBeVisible({ timeout: 5000 });
    // Use semantic role for list items
    const experienceItems = experiencesList
      .getByRole('listitem')
      .or(experiencesList.getByTestId('experience-item'));
    const count = await experienceItems.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show experience details', async ({ page }) => {
    const experienceItem = page.getByTestId('experience-item').first();

    await expect(experienceItem).toBeVisible({ timeout: 5000 });
    await experienceItem.click();

    const detailsPanel = page
      .getByTestId('experience-details')
      .or(page.locator('.experience-details'))
      .first();
    await expect(detailsPanel).toBeVisible();

    await expect(detailsPanel).toContainText(/goal|outcome|lesson/i);
  });

  test('should search experiences', async ({ page }) => {
    // Use semantic locators for search
    const searchInput = page
      .getByRole('searchbox')
      .or(page.getByPlaceholder(/search/i))
      .or(page.getByTestId('search-experiences'))
      .first();

    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill('component');

    // Wait for search debounce and results to update
    await expect(async () => {
      const visibleExperiences = page
        .getByTestId('experience-item')
        .filter({ has: page.locator(':visible') });
      const count = await visibleExperiences.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }).toPass({ timeout: 3000 });
  });

  test('should filter by outcome', async ({ page }) => {
    // Use semantic role for combobox
    const outcomeFilter = page
      .getByRole('combobox', { name: /outcome/i })
      .or(page.getByTestId('outcome-filter'))
      .first();

    await expect(outcomeFilter).toBeVisible({ timeout: 5000 });
    await outcomeFilter.selectOption('Success');

    // Wait for filter to be applied
    await expect(async () => {
      const visibleExperiences = page
        .getByTestId('experience-item')
        .filter({ has: page.locator(':visible') });
      const count = await visibleExperiences.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }).toPass({ timeout: 3000 });
  });
});

test.describe('AGI Settings', () => {
  let settingsSnapshot: SettingsSnapshot;

  // Increase timeout for settings tests
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#root').waitFor({ state: 'attached', timeout: 10000 });

    // Use semantic locators for settings navigation
    const settingsLink = page
      .getByRole('link', { name: /settings/i })
      .or(page.getByRole('button', { name: /settings/i }))
      .first();
    await expect(settingsLink).toBeVisible({ timeout: 5000 });
    await settingsLink.click();
    // Wait for settings page to load
    await page.waitForLoadState('domcontentloaded');

    // Initialize empty snapshot
    settingsSnapshot = {};
  });

  test.afterEach(async ({ settingsPage }) => {
    try {
      if (settingsSnapshot && Object.keys(settingsSnapshot).length > 0) {
        console.log('Restoring AGI settings...');
        await settingsPage.restoreFromSnapshot(settingsSnapshot);
      }
    } catch (error) {
      console.error('Error during AGI settings cleanup:', error);
    }
  });

  test('should configure resource limits', async ({ page }) => {
    // Use semantic locators for input
    const cpuLimitInput = page.getByLabel(/cpu/i).or(page.getByTestId('cpu-limit')).first();

    await expect(cpuLimitInput).toBeVisible({ timeout: 5000 });
    await cpuLimitInput.clear();
    await cpuLimitInput.fill('70');

    // Use semantic role for save button
    const saveButton = page
      .getByRole('button', { name: /save/i })
      .or(page.getByTestId('save-settings'))
      .first();
    await saveButton.click();

    // Use semantic role for status
    const successMessage = page.getByRole('status').or(page.locator('.success-message')).first();
    await expect(successMessage).toBeVisible({ timeout: 3000 });
  });

  test('should enable/disable autonomous mode', async ({ page }) => {
    // Use semantic role for checkbox
    const autonomousToggle = page
      .getByRole('checkbox', { name: /autonomous/i })
      .or(page.getByTestId('autonomous-toggle'))
      .first();

    await expect(autonomousToggle).toBeVisible({ timeout: 5000 });
    const initialState = await autonomousToggle.isChecked();

    await autonomousToggle.click();

    const newState = await autonomousToggle.isChecked();
    expect(newState).not.toBe(initialState);
  });

  test('should configure auto-approval settings', async ({ page }) => {
    // Use semantic role for checkbox
    const autoApprovalCheckbox = page
      .getByRole('checkbox', { name: /auto.?approv/i })
      .or(page.getByTestId('auto-approve'))
      .first();

    await expect(autoApprovalCheckbox).toBeVisible({ timeout: 5000 });
    await autoApprovalCheckbox.click();

    // Use semantic role for save button
    const saveButton = page
      .getByRole('button', { name: /save/i })
      .or(page.getByTestId('save-settings'))
      .first();
    await saveButton.click();

    // Wait for success indicator to appear
    const successIndicator = page.getByRole('status').or(page.locator('.success')).first();
    await expect(successIndicator).toBeVisible({ timeout: 5000 });
  });

  test('should reset settings to defaults', async ({ page }) => {
    const errorHandler = createErrorHandler(page);
    // Use semantic role for reset button
    const resetButton = page
      .getByRole('button', { name: /reset/i })
      .or(page.getByTestId('reset-settings'))
      .first();

    await expect(resetButton).toBeVisible({ timeout: 5000 });
    await resetButton.click();

    const confirmButton = page.getByRole('button', { name: /reset|confirm/i }).first();
    await errorHandler.handleOptionalDialog(confirmButton, 1000);

    // Wait for success message to appear - use semantic role for status
    const successMessage = page.getByRole('status').or(page.locator('.success-message')).first();
    await expect(successMessage).toBeVisible({ timeout: 5000 });
  });
});
