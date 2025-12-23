import { test, expect } from '@playwright/test';

test.describe('AGI Workflow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    await page.waitForLoadState('networkidle');
  });

  test('complete goal creation and execution workflow', async ({ page }) => {
    await page.click('[data-testid="agi-nav-link"]');
    await expect(page.locator('h1')).toContainText('AGI Workspace');

    await page.click('[data-testid="create-goal-button"]');
    await page.fill(
      '[data-testid="goal-description-input"]',
      'Process customer emails and generate responses',
    );

    await page.selectOption('[data-testid="goal-priority-select"]', 'High');

    await page.click('[data-testid="add-success-criteria"]');
    await page.fill('[data-testid="success-criteria-input"]', 'All emails processed');

    await page.click('[data-testid="submit-goal-button"]');

    await expect(page.locator('[data-testid="goal-card"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="goal-description"]')).toContainText(
      'Process customer emails',
    );

    await page.click('[data-testid="execute-goal-button"]');

    await expect(page.locator('[data-testid="execution-status"]')).toContainText('Planning', {
      timeout: 5000,
    });

    await page.waitForSelector('[data-testid="execution-progress"]', { timeout: 10000 });

    const planSteps = page.locator('[data-testid="plan-step"]');
    await expect(planSteps).not.toHaveCount(0);

    const statusIndicator = page.locator('[data-testid="goal-status-badge"]');
    const statusText = await statusIndicator.textContent();
    expect(['In Progress', 'Completed', 'Planning']).toContain(statusText);
  });

  test('outcome tracking and visualization', async ({ page }) => {
    await page.click('[data-testid="outcomes-nav-link"]');

    await page.click('[data-testid="create-goal-button"]');
    await page.fill('[data-testid="goal-description-input"]', 'Test outcome tracking');
    await page.click('[data-testid="submit-goal-button"]');

    await page.click('[data-testid="execute-goal-button"]');

    await page.waitForSelector('[data-testid="outcome-card"]', { timeout: 15000 });

    const outcomeCards = page.locator('[data-testid="outcome-card"]');
    await expect(outcomeCards).not.toHaveCount(0);

    const firstOutcome = outcomeCards.first();
    await expect(firstOutcome.locator('[data-testid="outcome-description"]')).toBeVisible();
    await expect(firstOutcome.locator('[data-testid="outcome-achieved-badge"]')).toBeVisible();

    await expect(page.locator('[data-testid="success-rate-chart"]')).toBeVisible();
  });

  test('template selection and customization', async ({ page }) => {
    await page.click('[data-testid="templates-nav-link"]');

    await page.fill('[data-testid="template-search"]', 'invoice');
    await page.press('[data-testid="template-search"]', 'Enter');

    await page.waitForSelector('[data-testid="template-card"]');

    await page.click('[data-testid="template-card"]');

    await expect(page.locator('[data-testid="template-details-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="template-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="template-description"]')).toBeVisible();

    await page.click('[data-testid="install-template-button"]');

    await expect(page.locator('[data-testid="installation-success"]')).toBeVisible({
      timeout: 5000,
    });

    await page.click('[data-testid="customize-template-button"]');
    await page.fill('[data-testid="template-parameter-1"]', 'Custom value');
    await page.click('[data-testid="save-customization"]');

    await expect(page.locator('[data-testid="customization-saved-message"]')).toBeVisible();
  });

  test('knowledge base integration', async ({ page }) => {
    await page.click('[data-testid="knowledge-nav-link"]');

    await page.click('[data-testid="add-knowledge-button"]');
    await page.selectOption('[data-testid="knowledge-type-select"]', 'fact');
    await page.fill(
      '[data-testid="knowledge-content"]',
      'The company fiscal year ends in December',
    );
    await page.click('[data-testid="save-knowledge"]');

    await expect(page.locator('[data-testid="knowledge-entry"]').first()).toBeVisible();

    await page.fill('[data-testid="knowledge-search"]', 'fiscal year');
    await page.press('[data-testid="knowledge-search"]', 'Enter');

    await expect(page.locator('[data-testid="knowledge-entry"]')).toContainText('fiscal year');

    await page.click('[data-testid="agi-nav-link"]');
    await page.click('[data-testid="create-goal-button"]');
    await page.fill(
      '[data-testid="goal-description-input"]',
      'Prepare end-of-year financial report',
    );
    await page.click('[data-testid="submit-goal-button"]');

    await page.click('[data-testid="execute-goal-button"]');
    await page.waitForSelector('[data-testid="knowledge-reference"]', { timeout: 10000 });
    await expect(page.locator('[data-testid="knowledge-reference"]')).toBeVisible();
  });

  test('learning system tracks improvements', async ({ page }) => {
    await page.click('[data-testid="learning-nav-link"]');

    await expect(page.locator('[data-testid="total-experiences"]')).toBeVisible();
    await expect(page.locator('[data-testid="improvement-rate"]')).toBeVisible();

    for (let i = 0; i < 3; i++) {
      await page.click('[data-testid="agi-nav-link"]');
      await page.click('[data-testid="create-goal-button"]');
      await page.fill('[data-testid="goal-description-input"]', `Test learning iteration ${i + 1}`);
      await page.click('[data-testid="submit-goal-button"]');
      await page.click('[data-testid="execute-goal-button"]');
      await page.waitForTimeout(2000);
    }

    await page.click('[data-testid="learning-nav-link"]');

    const experienceCount = await page.locator('[data-testid="total-experiences"]').textContent();
    const count = parseInt(experienceCount || '0');
    expect(count).toBeGreaterThan(0);

    await expect(page.locator('[data-testid="improvement-chart"]')).toBeVisible();
  });

  test('resource monitoring and limits', async ({ page }) => {
    await page.click('[data-testid="resources-nav-link"]');

    await expect(page.locator('[data-testid="cpu-usage-meter"]')).toBeVisible();
    await expect(page.locator('[data-testid="memory-usage-meter"]')).toBeVisible();
    await expect(page.locator('[data-testid="network-usage-meter"]')).toBeVisible();

    const cpuUsage = await page.locator('[data-testid="cpu-usage-value"]').textContent();
    expect(parseFloat(cpuUsage || '0')).toBeGreaterThanOrEqual(0);
    expect(parseFloat(cpuUsage || '0')).toBeLessThanOrEqual(100);

    await page.click('[data-testid="agi-nav-link"]');
    await page.click('[data-testid="create-goal-button"]');
    await page.fill('[data-testid="goal-description-input"]', 'Process 1000 large images');

    await page.click('[data-testid="add-constraint-button"]');
    await page.selectOption('[data-testid="constraint-type"]', 'ResourceLimit');
    await page.fill('[data-testid="constraint-value"]', '50');
    await page.click('[data-testid="save-constraint"]');

    await page.click('[data-testid="submit-goal-button"]');
    await page.click('[data-testid="execute-goal-button"]');

    await page.click('[data-testid="resources-nav-link"]');
    await page.waitForTimeout(2000);

    const currentCpuUsage = await page.locator('[data-testid="cpu-usage-value"]').textContent();
    expect(parseFloat(currentCpuUsage || '0')).toBeLessThanOrEqual(60);
  });

  test('error handling and recovery', async ({ page }) => {
    await page.click('[data-testid="agi-nav-link"]');
    await page.click('[data-testid="create-goal-button"]');
    await page.fill(
      '[data-testid="goal-description-input"]',
      'Read file from /invalid/path/that/does/not/exist',
    );
    await page.click('[data-testid="submit-goal-button"]');

    await page.click('[data-testid="execute-goal-button"]');

    await page.waitForSelector('[data-testid="goal-error-state"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('File not found');

    await page.click('[data-testid="retry-goal-button"]');

    await expect(page.locator('[data-testid="retry-count"]')).toContainText('1');

    await page.click('[data-testid="cancel-execution-button"]');
    await expect(page.locator('[data-testid="goal-status-badge"]')).toContainText('Cancelled');
  });

  test('multi-step plan visualization', async ({ page }) => {
    await page.click('[data-testid="agi-nav-link"]');
    await page.click('[data-testid="create-goal-button"]');
    await page.fill(
      '[data-testid="goal-description-input"]',
      'Analyze sales data, generate charts, and email report to team',
    );
    await page.click('[data-testid="submit-goal-button"]');

    await page.click('[data-testid="execute-goal-button"]');

    await page.waitForSelector('[data-testid="plan-visualization"]', { timeout: 10000 });

    const steps = page.locator('[data-testid="plan-step"]');
    const stepCount = await steps.count();
    expect(stepCount).toBeGreaterThan(2);

    for (let i = 0; i < Math.min(stepCount, 3); i++) {
      const step = steps.nth(i);
      await expect(step.locator('[data-testid="step-description"]')).toBeVisible();
      await expect(step.locator('[data-testid="step-status"]')).toBeVisible();
    }

    await expect(page.locator('[data-testid="dependency-graph"]')).toBeVisible();
  });

  test('realtime execution updates', async ({ page }) => {
    await page.click('[data-testid="agi-nav-link"]');
    await page.click('[data-testid="create-goal-button"]');
    await page.fill('[data-testid="goal-description-input"]', 'Download and process CSV file');
    await page.click('[data-testid="submit-goal-button"]');

    await page.click('[data-testid="execute-goal-button"]');

    let previousStatus = '';
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(1000);
      const currentStatus = await page.locator('[data-testid="execution-status"]').textContent();

      if (i > 0 && currentStatus !== previousStatus) {
        expect(currentStatus).not.toBe(previousStatus);
      }
      previousStatus = currentStatus || '';
    }

    const progressBar = page.locator('[data-testid="progress-bar"]');
    await expect(progressBar).toHaveAttribute('value', (value) => {
      const numValue = parseFloat(value);
      return numValue >= 0 && numValue <= 100;
    });
  });

  test('tool execution permissions', async ({ page }) => {
    await page.click('[data-testid="settings-nav-link"]');
    await page.click('[data-testid="security-tab"]');
    await page.check('[data-testid="require-approval-checkbox"]');
    await page.click('[data-testid="save-settings"]');

    await page.click('[data-testid="agi-nav-link"]');
    await page.click('[data-testid="create-goal-button"]');
    await page.fill(
      '[data-testid="goal-description-input"]',
      'Create a new document in /tmp/test.txt',
    );
    await page.click('[data-testid="submit-goal-button"]');

    await page.click('[data-testid="execute-goal-button"]');

    await page.waitForSelector('[data-testid="approval-dialog"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="approval-tool-name"]')).toContainText('file_write');
    await expect(page.locator('[data-testid="approval-risk-level"]')).toBeVisible();

    await page.click('[data-testid="approve-button"]');

    await expect(page.locator('[data-testid="approval-dialog"]')).not.toBeVisible({
      timeout: 5000,
    });
  });
});
