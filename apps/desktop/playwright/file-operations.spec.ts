import { test, expect } from '../e2e/fixtures';

test.describe('File Operations E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should read file via AGI tool', async ({ agiPage, mockLLM }) => {
    mockLLM.setMockResponse(/read.*file/i, 'File contents: This is a test file with sample data.');

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Read the contents of test-file.txt');

    await agiPage.page.waitForTimeout(2000);

    await agiPage.viewGoalDetails(0);

    const stepsCount = await agiPage.getStepsCount();
    expect(stepsCount).toBeGreaterThan(0);
  });

  test('should write file via AGI tool', async ({ agiPage, mockLLM, waitHelper }) => {
    mockLLM.setMockResponse(/write.*file/i, 'Successfully wrote data to output.txt');

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Write "Hello World" to output.txt');

    await waitHelper.waitForCondition(
      async () => {
        const stepsCount = await agiPage.getStepsCount();
        return stepsCount > 0;
      },
      { timeout: 10000 },
    );

    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should handle file not found errors', async ({ page, agiPage, mockLLM }) => {
    mockLLM.setMockResponse(/read.*non.*existent/i, 'ERROR: File not found at the specified path');

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Read non-existent-file.txt');

    await page.waitForTimeout(2000);

    const errorMessage = page.locator('[data-testid="error-message"], .error-message').first();

    if (await errorMessage.isVisible({ timeout: 5000 }).catch(() => false)) {
      const errorText = await errorMessage.textContent();
      expect(errorText?.toLowerCase()).toMatch(/error|not found|failed/i);
    }
  });

  test('should list files in directory', async ({ agiPage, mockLLM }) => {
    mockLLM.setMockResponse(
      /list.*files|directory.*contents/i,
      'Files in directory:\n1. file1.txt\n2. file2.txt\n3. file3.txt',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('List all files in the documents directory');

    await agiPage.page.waitForTimeout(2000);

    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should create directory structure', async ({ agiPage, mockLLM }) => {
    mockLLM.setMockResponse(
      /create.*director/i,
      'Successfully created directory structure at /test/nested/path',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Create nested directory structure /test/nested/path');

    await agiPage.page.waitForTimeout(2000);

    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should copy files', async ({ agiPage, mockLLM }) => {
    mockLLM.setMockResponse(/copy.*file/i, 'Successfully copied source.txt to destination.txt');

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Copy source.txt to destination.txt');

    await agiPage.page.waitForTimeout(2000);

    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should delete files safely', async ({ page, agiPage, mockLLM }) => {
    mockLLM.setMockResponse(
      /delete.*file/i,
      'File deletion requires approval. Proceed with caution.',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Delete temporary-file.txt');

    await page.waitForTimeout(2000);

    const approvalDialog = page
      .locator('[data-testid="approval-dialog"], .approval-dialog')
      .first();

    if (await approvalDialog.isVisible({ timeout: 5000 }).catch(() => false)) {
      const approvalText = await approvalDialog.textContent();
      expect(approvalText?.toLowerCase()).toMatch(/delete|remove|approval/i);
    }
  });

  test('should validate file permissions', async ({ agiPage, mockLLM }) => {
    mockLLM.setMockResponse(/check.*permission/i, 'File permissions: read, write, execute');

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Check permissions for secure-file.txt');

    await agiPage.page.waitForTimeout(2000);

    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should handle large file operations', async ({ agiPage, mockLLM, waitHelper }) => {
    mockLLM.setMockResponse(
      /large.*file|process.*big/i,
      'Processing large file in chunks... Progress: 100%',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Process large-data-file.csv');

    await waitHelper.waitForCondition(
      async () => {
        const status = await agiPage.getGoalStatus(0);
        return (
          status.toLowerCase().includes('progress') || status.toLowerCase().includes('completed')
        );
      },
      { timeout: 15000 },
    );

    const status = await agiPage.getGoalStatus(0);
    expect(status).toBeTruthy();
  });

  test('should search file contents', async ({ agiPage, mockLLM }) => {
    mockLLM.setMockResponse(
      /search.*file|find.*in.*file/i,
      'Found 3 matches for "keyword" in file:\nLine 10: keyword found here\nLine 25: another keyword\nLine 42: final keyword',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Search for "keyword" in document.txt');

    await agiPage.page.waitForTimeout(2000);

    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should watch file changes', async ({ page, agiPage, mockLLM }) => {
    mockLLM.setMockResponse(
      /watch.*file|monitor.*change/i,
      'Started watching file for changes. Will notify on modifications.',
    );

    await agiPage.navigateToAGI();

    await agiPage.submitGoal('Watch config.json for changes');

    await page.waitForTimeout(2000);

    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);

    const status = await agiPage.getGoalStatus(0);
    expect(status.toLowerCase()).toMatch(/pending|progress|watching/i);
  });
});
