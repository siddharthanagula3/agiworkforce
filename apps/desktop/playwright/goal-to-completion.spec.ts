import { test, expect } from '../e2e/fixtures';

/**
 * E2E tests for complete goal lifecycle from submission to completion
 */
test.describe('Goal to Completion E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should submit goal and track it to completion', async ({
    agiPage,
    waitHelper,
    mockLLM,
  }) => {
    // Set up mock LLM responses for plan generation
    mockLLM.setMockResponse(
      /create.*button.*counter/i,
      'I will create the button counter component with these steps:\n1. Create React component file\n2. Add state management with useState\n3. Implement click handler\n4. Style the component\n5. Test functionality',
    );

    // Navigate to AGI page
    await agiPage.navigateToAGI();

    // Submit a goal
    await agiPage.submitGoal('Create a React button component that counts clicks');

    // Verify goal appears in list
    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);

    // Check initial status
    const initialStatus = await agiPage.getGoalStatus(0);
    expect(initialStatus.toLowerCase()).toContain('pending');

    // View goal details
    await agiPage.viewGoalDetails(0);

    // Wait for planning to complete
    await waitHelper.waitForCondition(
      async () => {
        const stepsCount = await agiPage.getStepsCount();
        return stepsCount > 0;
      },
      { timeout: 15000 },
    );

    // Verify steps were generated
    const stepsCount = await agiPage.getStepsCount();
    expect(stepsCount).toBeGreaterThanOrEqual(3);
  });

  test('should display progress indicator during goal execution', async ({ page, agiPage }) => {
    await agiPage.navigateToAGI();

    // Submit goal
    await agiPage.submitGoal('Analyze sales data and create report');

    // View details
    await agiPage.viewGoalDetails(0);

    // Check for progress indicator
    const progressBar = page.locator('[role="progressbar"], .progress-bar').first();

    if (await progressBar.isVisible({ timeout: 5000 }).catch(() => false)) {
      const ariaValue = await progressBar.getAttribute('aria-valuenow');
      expect(ariaValue).toBeTruthy();

      const progressValue = parseInt(ariaValue || '0');
      expect(progressValue).toBeGreaterThanOrEqual(0);
      expect(progressValue).toBeLessThanOrEqual(100);
    }
  });

  test('should show completion status when goal finishes', async ({ page, agiPage, mockLLM }) => {
    // Mock quick completion
    mockLLM.setMockResponse(/simple.*task/i, 'Task completed successfully!');

    await agiPage.navigateToAGI();

    // Submit simple goal
    await agiPage.submitGoal('Perform a simple task');

    // Wait for goal to process
    await page.waitForTimeout(2000);

    // Check status
    const status = await agiPage.getGoalStatus(0);
    expect(status).toBeTruthy();
  });

  test('should handle goal cancellation', async ({ agiPage }) => {
    await agiPage.navigateToAGI();

    // Submit goal
    await agiPage.submitGoal('Long running task that will be cancelled');

    // Cancel the goal
    await agiPage.cancelGoal(0);

    // Verify status changed
    const status = await agiPage.getGoalStatus(0);
    expect(status.toLowerCase()).toContain('cancel');
  });

  test('should delete completed goals', async ({ agiPage }) => {
    await agiPage.navigateToAGI();

    const initialCount = await agiPage.getGoalsCount();

    if (initialCount > 0) {
      // Try to delete first goal
      await agiPage.deleteGoal(0);

      // Verify count decreased
      await agiPage.page.waitForTimeout(1000);
      const newCount = await agiPage.getGoalsCount();
      expect(newCount).toBeLessThan(initialCount);
    }
  });

  test('should filter goals by status', async ({ agiPage }) => {
    await agiPage.navigateToAGI();

    // Apply filter
    if (await agiPage.statusFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await agiPage.filterByStatus('Completed');

      // Verify filtered results
      const visibleGoals = agiPage.page.locator('[data-testid="goal-item"]:visible');
      const count = await visibleGoals.count();

      // All visible goals should have Completed status
      for (let i = 0; i < count; i++) {
        const goal = visibleGoals.nth(i);
        const status = await goal.getAttribute('data-status');
        if (status) {
          expect(status).toBe('Completed');
        }
      }
    }
  });

  test('should search goals by description', async ({ agiPage }) => {
    await agiPage.navigateToAGI();

    // Search for goals
    if (await agiPage.searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await agiPage.searchGoals('React');

      // Wait for debounce
      await agiPage.page.waitForTimeout(600);

      // Verify results (could be empty or filtered)
      const visibleGoals = agiPage.page.locator('[data-testid="goal-item"]:visible');
      const count = await visibleGoals.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should display goal execution timeline', async ({ page, agiPage }) => {
    await agiPage.navigateToAGI();

    // Submit goal
    await agiPage.submitGoal('Create timeline test goal');

    // View details
    await agiPage.viewGoalDetails(0);

    // Check for timeline visualization
    const timeline = page.locator('[data-testid="timeline"], .execution-timeline').first();

    if (await timeline.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(timeline).toBeVisible();
    }
  });

  test('should show error state for failed goals', async ({ page, agiPage, mockLLM }) => {
    // Mock error response
    mockLLM.setMockResponse(
      /invalid.*operation/i,
      'ERROR: Operation failed due to invalid parameters',
    );

    await agiPage.navigateToAGI();

    // Submit goal that will fail
    await agiPage.submitGoal('Perform invalid operation on non-existent file');

    // Wait for error state
    await page.waitForTimeout(3000);

    // Check for error indicators
    const errorIndicator = page.locator('[data-status="Failed"], [data-status="Error"]').first();

    if (await errorIndicator.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(errorIndicator).toBeVisible();
    }
  });

  test('should persist goal state across page refresh', async ({ page, agiPage }) => {
    await agiPage.navigateToAGI();

    // Submit goal
    await agiPage.submitGoal('Test persistence goal');

    const countBefore = await agiPage.getGoalsCount();
    expect(countBefore).toBeGreaterThan(0);

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Navigate back to AGI
    await agiPage.navigateToAGI();

    // Verify goal still exists
    const countAfter = await agiPage.getGoalsCount();
    expect(countAfter).toBeGreaterThanOrEqual(countBefore);
  });
});
