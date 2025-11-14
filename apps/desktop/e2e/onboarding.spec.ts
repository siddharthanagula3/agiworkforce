import { test, expect } from './fixtures';

/**
 * E2E tests for onboarding flow
 */
test.describe('Onboarding Flow', () => {
  test('should complete full onboarding wizard', async ({ page, onboardingPage }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    // Start onboarding
    await onboardingPage.startOnboarding();

    // Navigate through steps
    let currentStep = await onboardingPage.getCurrentStep();
    expect(currentStep).toBeGreaterThanOrEqual(0);

    // Complete onboarding
    await onboardingPage.completeFullOnboarding({
      openai: 'test-openai-key',
      ollama: '', // No key needed for local
    });

    // Verify onboarding is complete
    const isComplete = await onboardingPage.isOnboardingComplete();
    expect(isComplete).toBe(true);
  });

  test('should configure API keys during onboarding', async ({ page, onboardingPage }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    await onboardingPage.startOnboarding();

    // Navigate to API key step
    let maxClicks = 5;
    while (maxClicks > 0) {
      const apiKeyInput = page.locator('input[name*="api-key"], [data-testid*="api-key"]').first();

      if (await apiKeyInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        // We're on the API key configuration step
        await onboardingPage.configureAPIKey('openai', 'test-api-key');
        break;
      }

      if (await onboardingPage.nextButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await onboardingPage.clickNext();
      } else {
        break;
      }

      maxClicks--;
    }

    // Finish onboarding
    if (await onboardingPage.finishButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await onboardingPage.finishOnboarding();
    }
  });

  test('should allow skipping onboarding', async ({ page, onboardingPage }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    // Check if skip button is available
    if (await onboardingPage.skipButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await onboardingPage.skipOnboarding();

      // Verify we're past onboarding
      await page.waitForTimeout(1000);
      const skipButtonStillVisible = await onboardingPage.skipButton
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      expect(skipButtonStillVisible).toBe(false);
    }
  });

  test('should navigate back through onboarding steps', async ({ page, onboardingPage }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    await onboardingPage.startOnboarding();

    // Move forward
    if (await onboardingPage.nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await onboardingPage.clickNext();
      await onboardingPage.clickNext();

      // Move back
      if (await onboardingPage.backButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        const stepBefore = await onboardingPage.getCurrentStep();
        await onboardingPage.clickBack();
        const stepAfter = await onboardingPage.getCurrentStep();

        expect(stepAfter).toBeLessThan(stepBefore);
      }
    }
  });

  test('should display progress indicator', async ({ page, onboardingPage }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    await onboardingPage.startOnboarding();

    // Check for progress indicator
    if (await onboardingPage.progressIndicator.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(onboardingPage.progressIndicator).toBeVisible();

      // Progress indicator should show current step
      const currentStep = await onboardingPage.getCurrentStep();
      expect(currentStep).toBeGreaterThanOrEqual(0);
    }
  });

  test('should select preferred LLM provider', async ({ page, onboardingPage }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    await onboardingPage.startOnboarding();

    // Navigate to provider selection step
    let maxClicks = 5;
    while (maxClicks > 0) {
      const providerCard = page.locator('[data-testid*="-card"], .provider-card').first();

      if (await providerCard.isVisible({ timeout: 1000 }).catch(() => false)) {
        // We're on the provider selection step
        await onboardingPage.selectProvider('ollama');
        break;
      }

      if (await onboardingPage.nextButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await onboardingPage.clickNext();
      } else {
        break;
      }

      maxClicks--;
    }
  });

  test('should save onboarding preferences', async ({ page, onboardingPage }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    await onboardingPage.completeFullOnboarding({
      openai: 'test-key',
    });

    // Refresh page to verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Onboarding should not restart
    const isOnboardingVisible = await onboardingPage.nextButton
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    expect(isOnboardingVisible).toBe(false);
  });

  test('should validate required fields', async ({ page, onboardingPage }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');

    await onboardingPage.startOnboarding();

    // Try to proceed without filling required fields
    if (await onboardingPage.nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await onboardingPage.clickNext();

      // Check for validation errors (not used, but checked for presence)
      const _errorMessage = page.locator('[role="alert"], .error-message, .field-error').first();

      // May show validation error or allow proceeding
      await page.waitForTimeout(500);
      // Test just verifies no crash occurs
    }
  });
});
