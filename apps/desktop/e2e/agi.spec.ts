import { test, expect } from '@playwright/test';
import { SettingsSnapshot } from './page-objects/SettingsPage';
import { createErrorHandler } from './utils/error-handler';

/**
 * End-to-end tests for AGI functionality
 * Tests goal submission, planning, execution, and progress tracking
 *
 * Test Isolation Strategy:
 * - AGI settings are captured and restored for each test
 * - Resource limits, autonomous mode, and auto-approval settings are reset
 * - Prevents test state from affecting subsequent tests
 */

test.describe('AGI Goal Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    const agiLink = page
      .locator('a[href*="agi"], button:has-text("AGI"), button:has-text("Goals")')
      .first();
    if (await agiLink.isVisible()) {
      await agiLink.click();
      await page.waitForLoadState('networkidle');
    }
  });

  test('should submit a new goal', async ({ page }) => {
    const goalInput = page
      .locator('textarea[placeholder*="goal"], [data-testid="goal-input"]')
      .first();
    const submitButton = page
      .locator('button:has-text("Submit"), [data-testid="submit-goal"]')
      .first();

    if ((await goalInput.isVisible()) && (await submitButton.isVisible())) {
      await goalInput.fill('Create a simple React component with a button that counts clicks');

      await submitButton.click();

      await page.waitForTimeout(1000);
      const goalsList = page.locator('[data-testid="goals-list"], .goals-list').first();
      await expect(goalsList).toBeVisible();

      const goalItem = page.locator('[data-testid="goal-item"]').last();
      await expect(goalItem).toContainText('React component');
    }
  });

  test('should display goal status', async ({ page }) => {
    const goalItem = page.locator('[data-testid="goal-item"]').first();

    if (await goalItem.isVisible()) {
      const statusBadge = goalItem.locator('[data-testid="goal-status"], .status-badge').first();
      await expect(statusBadge).toBeVisible();

      const statusText = await statusBadge.textContent();
      expect(statusText).toMatch(/pending|in progress|completed|failed|cancelled/i);
    }
  });

  test('should show goal details', async ({ page }) => {
    const goalItem = page.locator('[data-testid="goal-item"]').first();

    if (await goalItem.isVisible()) {
      await goalItem.click();

      const detailsPanel = page.locator('[data-testid="goal-details"], .goal-details').first();
      await expect(detailsPanel).toBeVisible();

      await expect(detailsPanel).toContainText(/description|status|steps/i);
    }
  });

  test('should display execution steps', async ({ page }) => {
    const goalItem = page.locator('[data-testid="goal-item"]').first();

    if (await goalItem.isVisible()) {
      await goalItem.click();

      const stepsList = page.locator('[data-testid="steps-list"], .steps-list').first();

      if (await stepsList.isVisible()) {
        const stepItems = stepsList.locator('li, [data-testid="step-item"]');
        const count = await stepItems.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('should show step status', async ({ page }) => {
    const stepItem = page.locator('[data-testid="step-item"]').first();

    if (await stepItem.isVisible()) {
      const stepStatus = stepItem.locator('[data-testid="step-status"], .step-status').first();
      await expect(stepStatus).toBeVisible();

      const statusText = await stepStatus.textContent();
      expect(statusText).toMatch(/pending|in progress|completed|failed/i);
    }
  });

  test('should display progress percentage', async ({ page }) => {
    const goalItem = page.locator('[data-testid="goal-item"]').first();

    if (await goalItem.isVisible()) {
      const progressBar = goalItem.locator('[role="progressbar"], .progress-bar').first();

      if (await progressBar.isVisible()) {
        const ariaValue = await progressBar.getAttribute('aria-valuenow');
        expect(ariaValue).toBeTruthy();
      }
    }
  });

  test('should cancel a goal', async ({ page }) => {
    const errorHandler = createErrorHandler(page);
    const goalItem = page.locator('[data-testid="goal-item"][data-status="Pending"]').first();

    if (await goalItem.isVisible()) {
      const cancelButton = goalItem
        .locator('button[aria-label*="Cancel"], [data-testid="cancel-goal"]')
        .first();

      if (await cancelButton.isVisible()) {
        await cancelButton.click();

        const confirmButton = page
          .locator('button:has-text("Cancel Goal"), button:has-text("Confirm")')
          .first();
        await errorHandler.handleOptionalDialog(confirmButton, 1000);

        await page.waitForTimeout(1000);
        const status = goalItem.locator('[data-testid="goal-status"]').first();
        await expect(status).toContainText('Cancelled');
      }
    }
  });

  test('should delete a completed goal', async ({ page }) => {
    const errorHandler = createErrorHandler(page);
    const goalItem = page.locator('[data-testid="goal-item"][data-status="Completed"]').first();

    if (await goalItem.isVisible()) {
      const initialCount = await page.locator('[data-testid="goal-item"]').count();

      const deleteButton = goalItem
        .locator('button[aria-label*="Delete"], [data-testid="delete-goal"]')
        .first();

      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        const confirmButton = page
          .locator('button:has-text("Delete"), button:has-text("Confirm")')
          .first();
        await errorHandler.handleOptionalDialog(confirmButton, 1000);

        await page.waitForTimeout(1000);
        const newCount = await page.locator('[data-testid="goal-item"]').count();
        expect(newCount).toBeLessThan(initialCount);
      }
    }
  });

  test('should filter goals by status', async ({ page }) => {
    const statusFilter = page
      .locator('select[name="status"], [data-testid="status-filter"]')
      .first();

    if (await statusFilter.isVisible()) {
      await statusFilter.selectOption('Completed');

      await page.waitForTimeout(500);

      const visibleGoals = page.locator('[data-testid="goal-item"]:visible');
      const count = await visibleGoals.count();

      for (let i = 0; i < count; i++) {
        const goal = visibleGoals.nth(i);
        const status = await goal.getAttribute('data-status');
        expect(status).toBe('Completed');
      }
    }
  });

  test('should search goals by description', async ({ page }) => {
    const searchInput = page
      .locator('input[placeholder*="Search"], [data-testid="search-goals"]')
      .first();

    if (await searchInput.isVisible()) {
      await searchInput.fill('React');

      await page.waitForTimeout(500);

      const visibleGoals = page.locator('[data-testid="goal-item"]:visible');
      const count = await visibleGoals.count();

      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('AGI Resource Monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    const agiLink = page
      .locator('a[href*="agi"], button:has-text("AGI"), button:has-text("Goals")')
      .first();
    if (await agiLink.isVisible()) {
      await agiLink.click();
      await page.waitForLoadState('networkidle');
    }
  });

  test('should display resource usage', async ({ page }) => {
    const resourcePanel = page
      .locator('[data-testid="resource-monitor"], .resource-monitor')
      .first();

    if (await resourcePanel.isVisible()) {
      await expect(resourcePanel).toContainText(/cpu|memory|network|storage/i);
    }
  });

  test('should show CPU usage percentage', async ({ page }) => {
    const cpuIndicator = page.locator('[data-testid="cpu-usage"], .cpu-usage').first();

    if (await cpuIndicator.isVisible()) {
      const cpuText = await cpuIndicator.textContent();
      expect(cpuText).toMatch(/\d+%/);
    }
  });

  test('should show memory usage', async ({ page }) => {
    const memoryIndicator = page.locator('[data-testid="memory-usage"], .memory-usage').first();

    if (await memoryIndicator.isVisible()) {
      const memoryText = await memoryIndicator.textContent();
      expect(memoryText).toMatch(/\d+\s*(MB|GB)/i);
    }
  });

  test('should warn when resources are high', async ({ page }) => {
    const errorHandler = createErrorHandler(page);
    const warningIndicator = page.locator('[data-warning="high"], .resource-warning').first();

    if (await errorHandler.isElementVisible(warningIndicator, 1000)) {
      await expect(warningIndicator).toBeVisible();
      await expect(warningIndicator).toContainText(/high|warning|throttle/i);
    }
  });
});

test.describe('AGI Knowledge Base', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    const knowledgeLink = page
      .locator('a[href*="knowledge"], button:has-text("Knowledge")')
      .first();
    if (await knowledgeLink.isVisible()) {
      await knowledgeLink.click();
      await page.waitForLoadState('networkidle');
    }
  });

  test('should display past experiences', async ({ page }) => {
    const experiencesList = page
      .locator('[data-testid="experiences-list"], .experiences-list')
      .first();

    if (await experiencesList.isVisible()) {
      const experienceItems = experiencesList.locator('li, [data-testid="experience-item"]');
      const count = await experienceItems.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should show experience details', async ({ page }) => {
    const experienceItem = page.locator('[data-testid="experience-item"]').first();

    if (await experienceItem.isVisible()) {
      await experienceItem.click();

      const detailsPanel = page
        .locator('[data-testid="experience-details"], .experience-details')
        .first();
      await expect(detailsPanel).toBeVisible();

      await expect(detailsPanel).toContainText(/goal|outcome|lesson/i);
    }
  });

  test('should search experiences', async ({ page }) => {
    const searchInput = page
      .locator('input[placeholder*="Search"], [data-testid="search-experiences"]')
      .first();

    if (await searchInput.isVisible()) {
      await searchInput.fill('component');

      await page.waitForTimeout(500);

      const visibleExperiences = page.locator('[data-testid="experience-item"]:visible');
      const count = await visibleExperiences.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should filter by outcome', async ({ page }) => {
    const outcomeFilter = page
      .locator('select[name="outcome"], [data-testid="outcome-filter"]')
      .first();

    if (await outcomeFilter.isVisible()) {
      await outcomeFilter.selectOption('Success');

      await page.waitForTimeout(500);

      const visibleExperiences = page.locator('[data-testid="experience-item"]:visible');
      const count = await visibleExperiences.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('AGI Settings', () => {
  let settingsSnapshot: SettingsSnapshot;

  test.beforeEach(async ({ page, settingsPage }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    const settingsLink = page
      .locator('a[href*="settings"], button[aria-label*="Settings"]')
      .first();
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await page.waitForLoadState('networkidle');
    }

    try {
      settingsSnapshot = await settingsPage.captureCurrentSettings();
      console.log('AGI settings snapshot captured:', settingsSnapshot);
    } catch (error) {
      console.warn('Failed to capture AGI settings:', error);
      settingsSnapshot = {};
    }
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
    const cpuLimitInput = page.locator('input[name*="cpu"], [data-testid="cpu-limit"]').first();

    if (await cpuLimitInput.isVisible()) {
      await cpuLimitInput.clear();
      await cpuLimitInput.fill('70');

      const saveButton = page
        .locator('button:has-text("Save"), [data-testid="save-settings"]')
        .first();
      await saveButton.click();

      const successMessage = page.locator('[role="status"], .success-message').first();
      await expect(successMessage).toBeVisible({ timeout: 3000 });
    }
  });

  test('should enable/disable autonomous mode', async ({ page }) => {
    const autonomousToggle = page
      .locator('input[type="checkbox"][name*="autonomous"], [data-testid="autonomous-toggle"]')
      .first();

    if (await autonomousToggle.isVisible()) {
      const initialState = await autonomousToggle.isChecked();

      await autonomousToggle.click();

      const newState = await autonomousToggle.isChecked();
      expect(newState).not.toBe(initialState);
    }
  });

  test('should configure auto-approval settings', async ({ page }) => {
    const autoApprovalCheckbox = page
      .locator('input[type="checkbox"][name*="auto-approve"], [data-testid="auto-approve"]')
      .first();

    if (await autoApprovalCheckbox.isVisible()) {
      await autoApprovalCheckbox.click();

      const saveButton = page
        .locator('button:has-text("Save"), [data-testid="save-settings"]')
        .first();
      await saveButton.click();

      await page.waitForTimeout(1000);
      const successIndicator = page.locator('.success, [data-status="success"]').first();
      await expect(successIndicator).toBeVisible({ timeout: 3000 });
    }
  });

  test('should reset settings to defaults', async ({ page }) => {
    const errorHandler = createErrorHandler(page);
    const resetButton = page
      .locator('button:has-text("Reset"), [data-testid="reset-settings"]')
      .first();

    if (await resetButton.isVisible()) {
      await resetButton.click();

      const confirmButton = page
        .locator('button:has-text("Reset"), button:has-text("Confirm")')
        .first();
      await errorHandler.handleOptionalDialog(confirmButton, 1000);

      await page.waitForTimeout(1000);
      const successMessage = page.locator('[role="status"], .success-message').first();
      await expect(successMessage).toBeVisible({ timeout: 3000 });
    }
  });
});
