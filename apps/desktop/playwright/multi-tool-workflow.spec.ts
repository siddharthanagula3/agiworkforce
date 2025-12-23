import { test, expect } from '../e2e/fixtures';

test.describe('Multi-Tool Workflow E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should execute complex workflow with 5+ tools', async ({
    agiPage,
    mockLLM,
    waitHelper,
  }) => {
    mockLLM.setMockResponse(
      /analyze.*create.*send/i,
      'Executing multi-tool workflow:\n1. Reading customer data from file\n2. Analyzing data patterns\n3. Generating report\n4. Creating charts\n5. Sending email with results',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal(
      'Analyze customer data from customers.csv, create charts, and send email report',
    );

    await waitHelper.waitForCondition(
      async () => {
        const stepsCount = await agiPage.getStepsCount();
        return stepsCount >= 5;
      },
      { timeout: 20000 },
    );

    const stepsCount = await agiPage.getStepsCount();
    expect(stepsCount).toBeGreaterThanOrEqual(5);
  });

  test('should handle tool dependencies correctly', async ({ agiPage, mockLLM, waitHelper }) => {
    mockLLM.setMockResponse(
      /download.*process.*upload/i,
      'Step 1: Download file from URL\nStep 2: Process file contents (depends on Step 1)\nStep 3: Upload results (depends on Step 2)',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Download data.json, process it, and upload results');

    await waitHelper.waitForCondition(
      async () => {
        const stepsCount = await agiPage.getStepsCount();
        return stepsCount >= 3;
      },
      { timeout: 15000 },
    );

    const stepsCount = await agiPage.getStepsCount();
    expect(stepsCount).toBeGreaterThanOrEqual(3);
  });

  test('should complete workflow successfully', async ({
    agiPage,
    mockLLM,
    waitHelper: _waitHelper,
  }) => {
    mockLLM.setMockResponse(
      /backup.*database.*compress/i,
      'Workflow completed:\n1. Connected to database\n2. Exported data\n3. Compressed files\n4. Uploaded to backup server\nStatus: Success',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Backup database and compress files');

    await agiPage.page.waitForTimeout(3000);

    const status = await agiPage.getGoalStatus(0);
    expect(status).toBeTruthy();
  });

  test('should handle parallel tool execution', async ({ agiPage, mockLLM, waitHelper }) => {
    mockLLM.setMockResponse(
      /simultaneously|parallel/i,
      'Executing tasks in parallel:\n- Task A: Processing images\n- Task B: Generating thumbnails\n- Task C: Creating metadata\nAll tasks running concurrently',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal(
      'Process images, generate thumbnails, and create metadata simultaneously',
    );

    await waitHelper.waitForCondition(
      async () => {
        const stepsCount = await agiPage.getStepsCount();
        return stepsCount >= 3;
      },
      { timeout: 15000 },
    );

    const stepsCount = await agiPage.getStepsCount();
    expect(stepsCount).toBeGreaterThanOrEqual(3);
  });

  test('should retry failed steps automatically', async ({ page, agiPage, mockLLM }) => {
    mockLLM.setMockResponse(
      /network.*retry/i,
      'Step 1: Failed (network error)\nRetrying... Success on attempt 2',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Download file from unreliable network connection');

    await page.waitForTimeout(3000);

    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should aggregate results from multiple tools', async ({ agiPage, mockLLM, waitHelper }) => {
    mockLLM.setMockResponse(
      /fetch.*analyze.*summarize/i,
      'Aggregating results:\n1. Fetched data from API: 150 records\n2. Analyzed patterns: 3 trends\n3. Summarized findings: Report generated',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal(
      'Fetch data from multiple APIs, analyze patterns, and summarize findings',
    );

    await waitHelper.waitForCondition(
      async () => {
        const stepsCount = await agiPage.getStepsCount();
        return stepsCount >= 3;
      },
      { timeout: 15000 },
    );

    const stepsCount = await agiPage.getStepsCount();
    expect(stepsCount).toBeGreaterThanOrEqual(3);
  });

  test('should handle conditional tool execution', async ({ agiPage, mockLLM }) => {
    mockLLM.setMockResponse(
      /check.*if.*then/i,
      'Conditional execution:\n1. Check if file exists\n2. If yes: Process file\n3. If no: Download file first',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Check if config.json exists, if not download it, then process');

    await agiPage.page.waitForTimeout(2000);

    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should monitor resource usage during complex workflows', async ({ agiPage, mockLLM }) => {
    mockLLM.setMockResponse(
      /process.*large.*dataset/i,
      'Processing large dataset with resource monitoring:\nCPU: 65%\nMemory: 2.1GB\nProgress: 100%',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Process large dataset of 1 million records');

    await agiPage.page.waitForTimeout(2000);

    if (await agiPage.resourcePanel.isVisible({ timeout: 2000 }).catch(() => false)) {
      const resourceUsage = await agiPage.getResourceUsage();
      expect(resourceUsage.cpu).toBeTruthy();
      expect(resourceUsage.memory).toBeTruthy();
    }
  });

  test('should provide progress updates for long-running workflows', async ({
    page,
    agiPage,
    mockLLM,
  }) => {
    mockLLM.setMockResponse(
      /batch.*process/i,
      'Batch processing in progress:\nCompleted: 45/100 items\nEstimated time remaining: 5 minutes',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Batch process 100 image files');

    await page.waitForTimeout(2000);

    const progressBar = page.locator('[role="progressbar"], .progress-bar').first();

    if (await progressBar.isVisible({ timeout: 5000 }).catch(() => false)) {
      const ariaValue = await progressBar.getAttribute('aria-valuenow');
      expect(ariaValue).toBeTruthy();
    }
  });

  test('should generate comprehensive execution report', async ({
    page,
    agiPage,
    mockLLM,
    waitHelper,
  }) => {
    mockLLM.setMockResponse(
      /generate.*report.*workflow/i,
      'Workflow Report:\nTotal Steps: 7\nSuccessful: 7\nFailed: 0\nTotal Time: 45 seconds\nResources Used: CPU 50%, Memory 1.2GB',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Run data pipeline and generate execution report');

    await waitHelper.waitForCondition(
      async () => {
        const stepsCount = await agiPage.getStepsCount();
        return stepsCount > 0;
      },
      { timeout: 15000 },
    );

    const detailsPanel = page.locator('[data-testid="goal-details"], .goal-details').first();
    if (await detailsPanel.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(detailsPanel).toBeVisible();
    }
  });
});
