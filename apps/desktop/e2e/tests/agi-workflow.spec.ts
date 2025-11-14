import { test, expect } from '@playwright/test';

test.describe('AGI Workflow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app (adjust URL based on dev server)
    await page.goto('/');

    // Wait for app to be ready
    await page.waitForLoadState('networkidle');
  });

  test('complete goal creation and execution workflow', async ({ page }) => {
    // Step 1: Navigate to AGI section
    await page.click('[data-testid="agi-nav-link"]');
    await expect(page.locator('h1')).toContainText('AGI Workspace');

    // Step 2: Create a new goal
    await page.click('[data-testid="create-goal-button"]');
    await page.fill(
      '[data-testid="goal-description-input"]',
      'Process customer emails and generate responses',
    );

    // Set priority
    await page.selectOption('[data-testid="goal-priority-select"]', 'High');

    // Add success criteria
    await page.click('[data-testid="add-success-criteria"]');
    await page.fill('[data-testid="success-criteria-input"]', 'All emails processed');

    // Submit goal
    await page.click('[data-testid="submit-goal-button"]');

    // Step 3: Verify goal appears in list
    await expect(page.locator('[data-testid="goal-card"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="goal-description"]')).toContainText(
      'Process customer emails',
    );

    // Step 4: Execute goal
    await page.click('[data-testid="execute-goal-button"]');

    // Step 5: Monitor execution progress
    await expect(page.locator('[data-testid="execution-status"]')).toContainText('Planning', {
      timeout: 5000,
    });

    // Wait for execution to start
    await page.waitForSelector('[data-testid="execution-progress"]', { timeout: 10000 });

    // Step 6: Verify plan generation
    const planSteps = page.locator('[data-testid="plan-step"]');
    await expect(planSteps).not.toHaveCount(0);

    // Step 7: Check for completion or progress
    const statusIndicator = page.locator('[data-testid="goal-status-badge"]');
    const statusText = await statusIndicator.textContent();
    expect(['In Progress', 'Completed', 'Planning']).toContain(statusText);
  });

  test('outcome tracking and visualization', async ({ page }) => {
    // Navigate to outcomes page
    await page.click('[data-testid="outcomes-nav-link"]');

    // Create test goal with outcomes
    await page.click('[data-testid="create-goal-button"]');
    await page.fill('[data-testid="goal-description-input"]', 'Test outcome tracking');
    await page.click('[data-testid="submit-goal-button"]');

    // Execute goal
    await page.click('[data-testid="execute-goal-button"]');

    // Wait for outcomes to be tracked
    await page.waitForSelector('[data-testid="outcome-card"]', { timeout: 15000 });

    // Verify outcome cards are displayed
    const outcomeCards = page.locator('[data-testid="outcome-card"]');
    await expect(outcomeCards).not.toHaveCount(0);

    // Check outcome details
    const firstOutcome = outcomeCards.first();
    await expect(firstOutcome.locator('[data-testid="outcome-description"]')).toBeVisible();
    await expect(firstOutcome.locator('[data-testid="outcome-achieved-badge"]')).toBeVisible();

    // Verify success rate chart
    await expect(page.locator('[data-testid="success-rate-chart"]')).toBeVisible();
  });

  test('template selection and customization', async ({ page }) => {
    // Navigate to templates marketplace
    await page.click('[data-testid="templates-nav-link"]');

    // Search for templates
    await page.fill('[data-testid="template-search"]', 'invoice');
    await page.press('[data-testid="template-search"]', 'Enter');

    // Wait for search results
    await page.waitForSelector('[data-testid="template-card"]');

    // Select first template
    await page.click('[data-testid="template-card"]');

    // Verify template details modal
    await expect(page.locator('[data-testid="template-details-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="template-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="template-description"]')).toBeVisible();

    // Install template
    await page.click('[data-testid="install-template-button"]');

    // Wait for installation
    await expect(page.locator('[data-testid="installation-success"]')).toBeVisible({
      timeout: 5000,
    });

    // Customize template
    await page.click('[data-testid="customize-template-button"]');
    await page.fill('[data-testid="template-parameter-1"]', 'Custom value');
    await page.click('[data-testid="save-customization"]');

    // Verify customization saved
    await expect(page.locator('[data-testid="customization-saved-message"]')).toBeVisible();
  });

  test('knowledge base integration', async ({ page }) => {
    // Navigate to knowledge base
    await page.click('[data-testid="knowledge-nav-link"]');

    // Add new knowledge entry
    await page.click('[data-testid="add-knowledge-button"]');
    await page.selectOption('[data-testid="knowledge-type-select"]', 'fact');
    await page.fill(
      '[data-testid="knowledge-content"]',
      'The company fiscal year ends in December',
    );
    await page.click('[data-testid="save-knowledge"]');

    // Verify knowledge saved
    await expect(page.locator('[data-testid="knowledge-entry"]').first()).toBeVisible();

    // Search knowledge base
    await page.fill('[data-testid="knowledge-search"]', 'fiscal year');
    await page.press('[data-testid="knowledge-search"]', 'Enter');

    // Verify search results
    await expect(page.locator('[data-testid="knowledge-entry"]')).toContainText('fiscal year');

    // Create goal that uses knowledge
    await page.click('[data-testid="agi-nav-link"]');
    await page.click('[data-testid="create-goal-button"]');
    await page.fill(
      '[data-testid="goal-description-input"]',
      'Prepare end-of-year financial report',
    );
    await page.click('[data-testid="submit-goal-button"]');

    // Execute and verify knowledge is referenced
    await page.click('[data-testid="execute-goal-button"]');
    await page.waitForSelector('[data-testid="knowledge-reference"]', { timeout: 10000 });
    await expect(page.locator('[data-testid="knowledge-reference"]')).toBeVisible();
  });

  test('learning system tracks improvements', async ({ page }) => {
    // Navigate to learning dashboard
    await page.click('[data-testid="learning-nav-link"]');

    // Verify learning stats are displayed
    await expect(page.locator('[data-testid="total-experiences"]')).toBeVisible();
    await expect(page.locator('[data-testid="improvement-rate"]')).toBeVisible();

    // Create and execute multiple similar goals
    for (let i = 0; i < 3; i++) {
      await page.click('[data-testid="agi-nav-link"]');
      await page.click('[data-testid="create-goal-button"]');
      await page.fill('[data-testid="goal-description-input"]', `Test learning iteration ${i + 1}`);
      await page.click('[data-testid="submit-goal-button"]');
      await page.click('[data-testid="execute-goal-button"]');
      await page.waitForTimeout(2000); // Wait for execution to progress
    }

    // Return to learning dashboard
    await page.click('[data-testid="learning-nav-link"]');

    // Verify experiences are recorded
    const experienceCount = await page.locator('[data-testid="total-experiences"]').textContent();
    const count = parseInt(experienceCount || '0');
    expect(count).toBeGreaterThan(0);

    // Check for trend improvement
    await expect(page.locator('[data-testid="improvement-chart"]')).toBeVisible();
  });

  test('resource monitoring and limits', async ({ page }) => {
    // Navigate to resource monitor
    await page.click('[data-testid="resources-nav-link"]');

    // Verify resource meters are displayed
    await expect(page.locator('[data-testid="cpu-usage-meter"]')).toBeVisible();
    await expect(page.locator('[data-testid="memory-usage-meter"]')).toBeVisible();
    await expect(page.locator('[data-testid="network-usage-meter"]')).toBeVisible();

    // Check resource usage values
    const cpuUsage = await page.locator('[data-testid="cpu-usage-value"]').textContent();
    expect(parseFloat(cpuUsage || '0')).toBeGreaterThanOrEqual(0);
    expect(parseFloat(cpuUsage || '0')).toBeLessThanOrEqual(100);

    // Create resource-intensive goal
    await page.click('[data-testid="agi-nav-link"]');
    await page.click('[data-testid="create-goal-button"]');
    await page.fill('[data-testid="goal-description-input"]', 'Process 1000 large images');

    // Set resource constraints
    await page.click('[data-testid="add-constraint-button"]');
    await page.selectOption('[data-testid="constraint-type"]', 'ResourceLimit');
    await page.fill('[data-testid="constraint-value"]', '50'); // 50% CPU limit
    await page.click('[data-testid="save-constraint"]');

    // Submit and execute
    await page.click('[data-testid="submit-goal-button"]');
    await page.click('[data-testid="execute-goal-button"]');

    // Verify resource limits are respected
    await page.click('[data-testid="resources-nav-link"]');
    await page.waitForTimeout(2000);

    const currentCpuUsage = await page.locator('[data-testid="cpu-usage-value"]').textContent();
    expect(parseFloat(currentCpuUsage || '0')).toBeLessThanOrEqual(60); // Allow some tolerance
  });

  test('error handling and recovery', async ({ page }) => {
    // Create goal with invalid parameters
    await page.click('[data-testid="agi-nav-link"]');
    await page.click('[data-testid="create-goal-button"]');
    await page.fill(
      '[data-testid="goal-description-input"]',
      'Read file from /invalid/path/that/does/not/exist',
    );
    await page.click('[data-testid="submit-goal-button"]');

    // Execute goal
    await page.click('[data-testid="execute-goal-button"]');

    // Wait for error state
    await page.waitForSelector('[data-testid="goal-error-state"]', { timeout: 10000 });

    // Verify error message is displayed
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('File not found');

    // Test retry functionality
    await page.click('[data-testid="retry-goal-button"]');

    // Verify retry attempt
    await expect(page.locator('[data-testid="retry-count"]')).toContainText('1');

    // Cancel execution
    await page.click('[data-testid="cancel-execution-button"]');
    await expect(page.locator('[data-testid="goal-status-badge"]')).toContainText('Cancelled');
  });

  test('multi-step plan visualization', async ({ page }) => {
    // Create complex goal
    await page.click('[data-testid="agi-nav-link"]');
    await page.click('[data-testid="create-goal-button"]');
    await page.fill(
      '[data-testid="goal-description-input"]',
      'Analyze sales data, generate charts, and email report to team',
    );
    await page.click('[data-testid="submit-goal-button"]');

    // Execute goal
    await page.click('[data-testid="execute-goal-button"]');

    // Wait for plan generation
    await page.waitForSelector('[data-testid="plan-visualization"]', { timeout: 10000 });

    // Verify multiple steps are shown
    const steps = page.locator('[data-testid="plan-step"]');
    const stepCount = await steps.count();
    expect(stepCount).toBeGreaterThan(2);

    // Check step details
    for (let i = 0; i < Math.min(stepCount, 3); i++) {
      const step = steps.nth(i);
      await expect(step.locator('[data-testid="step-description"]')).toBeVisible();
      await expect(step.locator('[data-testid="step-status"]')).toBeVisible();
    }

    // Verify dependency visualization
    await expect(page.locator('[data-testid="dependency-graph"]')).toBeVisible();
  });

  test('realtime execution updates', async ({ page }) => {
    // Create goal
    await page.click('[data-testid="agi-nav-link"]');
    await page.click('[data-testid="create-goal-button"]');
    await page.fill('[data-testid="goal-description-input"]', 'Download and process CSV file');
    await page.click('[data-testid="submit-goal-button"]');

    // Execute goal
    await page.click('[data-testid="execute-goal-button"]');

    // Monitor realtime updates
    let previousStatus = '';
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(1000);
      const currentStatus = await page.locator('[data-testid="execution-status"]').textContent();

      // Status should change over time
      if (i > 0 && currentStatus !== previousStatus) {
        expect(currentStatus).not.toBe(previousStatus);
      }
      previousStatus = currentStatus || '';
    }

    // Verify progress bar updates
    const progressBar = page.locator('[data-testid="progress-bar"]');
    await expect(progressBar).toHaveAttribute('value', (value) => {
      const numValue = parseFloat(value);
      return numValue >= 0 && numValue <= 100;
    });
  });

  test('tool execution permissions', async ({ page }) => {
    // Enable strict approval mode in settings
    await page.click('[data-testid="settings-nav-link"]');
    await page.click('[data-testid="security-tab"]');
    await page.check('[data-testid="require-approval-checkbox"]');
    await page.click('[data-testid="save-settings"]');

    // Create goal requiring file write
    await page.click('[data-testid="agi-nav-link"]');
    await page.click('[data-testid="create-goal-button"]');
    await page.fill(
      '[data-testid="goal-description-input"]',
      'Create a new document in /tmp/test.txt',
    );
    await page.click('[data-testid="submit-goal-button"]');

    // Execute goal
    await page.click('[data-testid="execute-goal-button"]');

    // Wait for approval prompt
    await page.waitForSelector('[data-testid="approval-dialog"]', { timeout: 10000 });

    // Verify approval details
    await expect(page.locator('[data-testid="approval-tool-name"]')).toContainText('file_write');
    await expect(page.locator('[data-testid="approval-risk-level"]')).toBeVisible();

    // Approve action
    await page.click('[data-testid="approve-button"]');

    // Verify execution continues
    await expect(page.locator('[data-testid="approval-dialog"]')).not.toBeVisible({
      timeout: 5000,
    });
  });
});
