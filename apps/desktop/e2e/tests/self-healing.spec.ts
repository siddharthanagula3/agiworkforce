import { test, expect } from '../fixtures';

test.describe('Self-Healing Agent', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('retries after initial tool failure and returns a recovery plan', async ({
    page,
    mockLLM,
  }) => {
    const prompt = 'Read /invalid/path/config.json and continue the task';

    mockLLM.setFailOnce(/invalid\/path\/config\.json/i, 500, 'File not found');
    mockLLM.setResponseSequence(/invalid\/path\/config\.json/i, [
      'Initial attempt failed due to a missing file. Starting self-healing recovery.',
      'Recovery complete: I validated fallback paths, regenerated config, and resumed execution.',
    ]);

    const chatInput = page.getByRole('textbox', { name: /message/i });
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill(prompt);
    await page.getByRole('button', { name: /send/i }).click();

    const errorAlert = page.getByRole('alert').first();
    await expect(errorAlert).toBeVisible({ timeout: 15000 });

    const retryButton = page.getByRole('button', { name: /retry|regenerate|try again/i }).first();
    if (await retryButton.isVisible().catch(() => false)) {
      await retryButton.click();
    } else {
      await chatInput.fill(prompt);
      await page.getByRole('button', { name: /send/i }).click();
    }

    const assistantMessage = page.locator('[data-role="assistant"]').last();
    await expect(assistantMessage).toBeVisible({ timeout: 20000 });
    await expect(assistantMessage).toContainText(/self-healing|recovery|fallback|resumed execution/i);
  });
});
