import { test, expect } from '../e2e/fixtures';

/**
 * E2E tests for browser automation through AGI
 */
test.describe('Browser Automation E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should automate browser navigation task', async ({ agiPage, mockLLM }) => {
    // Mock browser automation response
    mockLLM.setMockResponse(
      /navigate.*browser|open.*website/i,
      'Successfully navigated to https://example.com',
    );

    await agiPage.navigateToAGI();

    // Submit goal for browser automation
    await agiPage.submitGoal('Navigate to https://example.com');

    await agiPage.page.waitForTimeout(2000);

    // Verify goal was created
    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should verify browser automation execution', async ({ agiPage, mockLLM, waitHelper }) => {
    // Mock browser click action
    mockLLM.setMockResponse(
      /click.*button|interact.*element/i,
      'Successfully clicked the submit button',
    );

    await agiPage.navigateToAGI();

    // Submit goal to click element
    await agiPage.submitGoal('Click the submit button on the form');

    // Wait for execution
    await waitHelper.waitForCondition(
      async () => {
        const stepsCount = await agiPage.getStepsCount();
        return stepsCount > 0;
      },
      { timeout: 10000 },
    );

    // Verify steps were generated
    const stepsCount = await agiPage.getStepsCount();
    expect(stepsCount).toBeGreaterThan(0);
  });

  test('should fill forms via browser automation', async ({ agiPage, mockLLM }) => {
    // Mock form filling
    mockLLM.setMockResponse(
      /fill.*form|enter.*data/i,
      'Successfully filled form fields with provided data',
    );

    await agiPage.navigateToAGI();

    // Submit goal to fill form
    await agiPage.submitGoal('Fill the login form with username and password');

    await agiPage.page.waitForTimeout(2000);

    // Verify goal exists
    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should extract data from web pages', async ({ agiPage, mockLLM }) => {
    // Mock data extraction
    mockLLM.setMockResponse(
      /extract.*data|scrape.*information/i,
      'Extracted data:\nTitle: Example Page\nHeading: Welcome\nParagraphs: 5',
    );

    await agiPage.navigateToAGI();

    // Submit goal to extract data
    await agiPage.submitGoal('Extract all headings from https://example.com');

    await agiPage.page.waitForTimeout(2000);

    // Verify goal was created
    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should take screenshots of web pages', async ({ agiPage, mockLLM }) => {
    // Mock screenshot capture
    mockLLM.setMockResponse(
      /screenshot|capture.*page/i,
      'Successfully captured screenshot of the page',
    );

    await agiPage.navigateToAGI();

    // Submit goal to capture screenshot
    await agiPage.submitGoal('Take a screenshot of https://example.com');

    await agiPage.page.waitForTimeout(2000);

    // Verify goal exists
    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should handle browser errors gracefully', async ({ page, agiPage, mockLLM }) => {
    // Mock browser error
    mockLLM.setMockResponse(
      /navigate.*invalid/i,
      'ERROR: Failed to navigate - invalid URL or page not found',
    );

    await agiPage.navigateToAGI();

    // Submit goal with invalid URL
    await agiPage.submitGoal('Navigate to invalid-url');

    await page.waitForTimeout(2000);

    // Check for error state
    const goalStatus = await agiPage.getGoalStatus(0);
    expect(goalStatus).toBeTruthy();
  });

  test('should wait for page elements to load', async ({ agiPage, mockLLM }) => {
    // Mock waiting for elements
    mockLLM.setMockResponse(
      /wait.*element|wait.*load/i,
      'Successfully waited for element to appear on page',
    );

    await agiPage.navigateToAGI();

    // Submit goal to wait for element
    await agiPage.submitGoal('Wait for the login button to appear');

    await agiPage.page.waitForTimeout(2000);

    // Verify goal exists
    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should execute JavaScript in browser context', async ({ agiPage, mockLLM }) => {
    // Mock JavaScript execution
    mockLLM.setMockResponse(
      /execute.*javascript|run.*script/i,
      'Successfully executed JavaScript: Result = 42',
    );

    await agiPage.navigateToAGI();

    // Submit goal to execute JS
    await agiPage.submitGoal('Execute JavaScript to calculate sum');

    await agiPage.page.waitForTimeout(2000);

    // Verify goal was created
    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should handle authentication flows', async ({ agiPage, mockLLM }) => {
    // Mock authentication
    mockLLM.setMockResponse(
      /login|authenticate|sign.*in/i,
      'Successfully logged in to the application',
    );

    await agiPage.navigateToAGI();

    // Submit goal for authentication
    await agiPage.submitGoal('Login to the application with credentials');

    await agiPage.page.waitForTimeout(2000);

    // Verify goal exists
    const goalsCount = await agiPage.getGoalsCount();
    expect(goalsCount).toBeGreaterThan(0);
  });

  test('should navigate through multi-step workflows', async ({ agiPage, mockLLM, waitHelper }) => {
    // Mock multi-step workflow
    mockLLM.setMockResponse(
      /checkout.*process|multi.*step/i,
      'Completed multi-step workflow:\n1. Added item to cart\n2. Proceeded to checkout\n3. Entered shipping info\n4. Confirmed order',
    );

    await agiPage.navigateToAGI();

    // Submit complex goal
    await agiPage.submitGoal('Complete the checkout process for items in cart');

    // Wait for steps to be generated
    await waitHelper.waitForCondition(
      async () => {
        const stepsCount = await agiPage.getStepsCount();
        return stepsCount >= 3;
      },
      { timeout: 15000 },
    );

    // Verify multiple steps were created
    const stepsCount = await agiPage.getStepsCount();
    expect(stepsCount).toBeGreaterThanOrEqual(3);
  });
});
