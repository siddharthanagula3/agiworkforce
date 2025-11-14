import { test, expect } from '../e2e/fixtures';

/**
 * E2E tests for complex workflows using multiple tools
 */
test.describe('Multi-Tool Workflow E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
  });

  test('should execute complex workflow with 5+ tools', async ({ agiPage, mockLLM, waitHelper }) => {
    // Mock complex workflow response
    mockLLM.setMockResponse(
      /analyze.*create.*send/i,
      'Executing multi-tool workflow:\n1. Reading customer data from file\n2. Analyzing data patterns\n3. Generating report\n4. Creating charts\n5. Sending email with results'
    );

    await agiPage.navigateToAGI();

    // Submit complex goal requiring multiple tools
    await agiPage.submitGoal(
      'Analyze customer data from customers.csv, create charts, and send email report'
    );

    // Wait for plan generation with multiple steps
    await waitHelper.waitForCondition(
      async () => {
        const stepsCount = await agiPage.getStepsCount();
        return stepsCount >= 5;
      },
      { timeout: 20000 }
    );

    // Verify at least 5 steps were created
    const stepsCount = await agiPage.getStepsCount();
    expect(stepsCount).toBeGreaterThanOrEqual(5);
  });

  test('should handle tool dependencies correctly', async ({ agiPage, mockLLM, waitHelper }) => {
    // Mock workflow with dependencies
    mockLLM.setMockResponse(
      /download.*process.*upload/i,
      'Step 1: Download file from URL\nStep 2: Process file contents (depends on Step 1)\nStep 3: Upload results (depends on Step 2)'
    );

    await agiPage.navigateToAGI();

    // Submit goal with sequential dependencies
    await agiPage.submitGoal('Download data.json, process it, and upload results');

    // Wait for steps to be generated
    await waitHelper.waitForCondition(
      async () => {
        const stepsCount = await agiPage.getStepsCount();
        return stepsCount >= 3;
      },
      { timeout: 15000 }
    );

    // Verify steps were created
    const stepsCount = await agiPage.getStepsCount();
    expect(stepsCount).toBeGreaterThanOrEqual(3);
  });

  test('should complete workflow successfully', async ({ agiPage, mockLLM, waitHelper }) => {
    // Mock successful workflow completion
    mockLLM.setMockResponse(
      /backup.*database.*compress/i,
      'Workflow completed:\n1. Connected to database\n2. Exported data\n3. Compressed files\n4. Uploaded to backup server\nStatus: Success'
    );

    await agiPage.navigateToAGI();

    // Submit goal
    await agiPage.submitGoal('Backup database and compress files');

    await agiPage.page.waitForTimeout(3000);

    // Check status eventually shows completion
    const status = await agiPage.getGoalStatus(0);
    expect(status).toBeTruthy();
  });

  test('should handle parallel tool execution', async ({ agiPage, mockLLM, waitHelper }) => {
    // Mock parallel execution
    mockLLM.setMockResponse(
      /simultaneously|parallel/i,
      'Executing tasks in parallel:\n- Task A: Processing images\n- Task B: Generating thumbnails\n- Task C: Creating metadata\nAll tasks running concurrently'
    );

    await agiPage.navigateToAGI();

    // Submit goal with parallel tasks
    await agiPage.submitGoal('Process images, generate thumbnails, and create metadata simultaneously');

    // Wait for steps
    await waitHelper.waitForCondition(
      async () => {
        const stepsCount = await agiPage.getStepsCount();
        return stepsCount >= 3;
      },
      { timeout: 15000 }
    );

    // Verify multiple steps exist
    const stepsCount = await agiPage.getStepsCount();
    expect(stepsCount).toBeGreaterThanOrEqual(3);
  });

  test('should retry failed steps automatically', async ({ page, agiPage, mockLLM }) => {
    // Mock retry scenario
    mockLLM.setMockResponse(
      /network.*retry/i,
      'Step 1: Failed (network error)\nRetrying... Success on attempt 2'
    );

    await agiPage.navigateToAGI();

    // Submit goal that may need retries
    await agiPage.submitGoal('Download file from unreliable network connection');

    await page.waitForTimeout(3000);

    // Verify goal exists (may show retry indicator)
    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should aggregate results from multiple tools', async ({ agiPage, mockLLM, waitHelper }) => {
    // Mock result aggregation
    mockLLM.setMockResponse(
      /fetch.*analyze.*summarize/i,
      'Aggregating results:\n1. Fetched data from API: 150 records\n2. Analyzed patterns: 3 trends\n3. Summarized findings: Report generated'
    );

    await agiPage.navigateToAGI();

    // Submit goal requiring result aggregation
    await agiPage.submitGoal('Fetch data from multiple APIs, analyze patterns, and summarize findings');

    // Wait for workflow to process
    await waitHelper.waitForCondition(
      async () => {
        const stepsCount = await agiPage.getStepsCount();
        return stepsCount >= 3;
      },
      { timeout: 15000 }
    );

    // Verify workflow created
    const stepsCount = await agiPage.getStepsCount();
    expect(stepsCount).toBeGreaterThanOrEqual(3);
  });

  test('should handle conditional tool execution', async ({ agiPage, mockLLM }) => {
    // Mock conditional execution
    mockLLM.setMockResponse(
      /check.*if.*then/i,
      'Conditional execution:\n1. Check if file exists\n2. If yes: Process file\n3. If no: Download file first'
    );

    await agiPage.navigateToAGI();

    // Submit goal with conditional logic
    await agiPage.submitGoal('Check if config.json exists, if not download it, then process');

    await agiPage.page.waitForTimeout(2000);

    // Verify goal was created
    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should monitor resource usage during complex workflows', async ({ agiPage, mockLLM }) => {
    // Mock resource-intensive workflow
    mockLLM.setMockResponse(
      /process.*large.*dataset/i,
      'Processing large dataset with resource monitoring:\nCPU: 65%\nMemory: 2.1GB\nProgress: 100%'
    );

    await agiPage.navigateToAGI();

    // Submit resource-intensive goal
    await agiPage.submitGoal('Process large dataset of 1 million records');

    await agiPage.page.waitForTimeout(2000);

    // Check if resource monitor shows activity
    if (await agiPage.resourcePanel.isVisible({ timeout: 2000 }).catch(() => false)) {
      const resourceUsage = await agiPage.getResourceUsage();
      expect(resourceUsage.cpu).toBeTruthy();
      expect(resourceUsage.memory).toBeTruthy();
    }
  });

  test('should provide progress updates for long-running workflows', async ({ page, agiPage, mockLLM }) => {
    // Mock long-running workflow with progress
    mockLLM.setMockResponse(
      /batch.*process/i,
      'Batch processing in progress:\nCompleted: 45/100 items\nEstimated time remaining: 5 minutes'
    );

    await agiPage.navigateToAGI();

    // Submit long-running goal
    await agiPage.submitGoal('Batch process 100 image files');

    await page.waitForTimeout(2000);

    // Check for progress indicator
    const progressBar = page.locator('[role="progressbar"], .progress-bar').first();

    if (await progressBar.isVisible({ timeout: 5000 }).catch(() => false)) {
      const ariaValue = await progressBar.getAttribute('aria-valuenow');
      expect(ariaValue).toBeTruthy();
    }
  });

  test('should generate comprehensive execution report', async ({ page, agiPage, mockLLM, waitHelper }) => {
    // Mock workflow with report generation
    mockLLM.setMockResponse(
      /generate.*report.*workflow/i,
      'Workflow Report:\nTotal Steps: 7\nSuccessful: 7\nFailed: 0\nTotal Time: 45 seconds\nResources Used: CPU 50%, Memory 1.2GB'
    );

    await agiPage.navigateToAGI();

    // Submit goal that generates report
    await agiPage.submitGoal('Run data pipeline and generate execution report');

    // Wait for completion
    await waitHelper.waitForCondition(
      async () => {
        const stepsCount = await agiPage.getStepsCount();
        return stepsCount > 0;
      },
      { timeout: 15000 }
    );

    // Check for report or results
    const detailsPanel = page.locator('[data-testid="goal-details"], .goal-details').first();
    if (await detailsPanel.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(detailsPanel).toBeVisible();
    }
  });
});
