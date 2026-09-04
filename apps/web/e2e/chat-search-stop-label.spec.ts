import { test, expect } from '@playwright/test';

import { signIn } from './qa-capability-harness';

test.describe('activity pill after a stopped search', () => {
  test('a search stopped mid-flight reads as stopped, not searched', async ({ page }) => {
    await signIn(page);
    await page.goto('/chat');

    const composer = page.getByRole('textbox').first();
    await composer.waitFor({ state: 'visible', timeout: 20000 });

    await page.getByRole('button', { name: 'Change model' }).click();
    const modelsDialog = page.getByRole('dialog', { name: 'Models' });
    await modelsDialog.getByRole('textbox', { name: 'Search models' }).fill('GPT-5.6 Luna');
    await modelsDialog.getByRole('button', { name: 'GPT-5.6 Luna' }).first().click();

    await composer.fill(
      `Search the web for today's top technology headline and summarize it in one sentence. (ref ${Date.now()})`,
    );
    await composer.press('Enter');

    const stopButton = page.getByRole('button', { name: 'Stop the current response' });
    await stopButton.waitFor({ state: 'visible', timeout: 15000 });
    await stopButton.click({ timeout: 5000 }).catch(() => undefined);

    const activityTrigger = page.getByRole('button', { name: /show agent activity/i });
    await expect(activityTrigger).not.toContainText(/searched the web/i, { timeout: 15000 });
    await expect(activityTrigger).toContainText(/stopped|cancelled/i, { timeout: 15000 });
  });
});
