import { test, expect } from '@playwright/test';

import { signIn } from './qa-capability-harness';

const STOP_BUTTON_NAME = 'Stop the current response';
const PLUS_MENU_NAME = 'More composer options';

test.describe('escape during a streaming turn', () => {
  test('escape in the composer stops the turn when no menu is open', async ({ page }) => {
    await signIn(page);
    await page.goto('/chat');

    const composer = page.getByRole('textbox').first();
    await composer.waitFor({ state: 'visible', timeout: 20000 });

    await composer.fill(
      `Write a detailed history of the bicycle in at least ten paragraphs. (ref ${Date.now()})`,
    );
    await composer.press('Enter');

    const stopButton = page.getByRole('button', { name: STOP_BUTTON_NAME });
    await stopButton.waitFor({ state: 'visible', timeout: 20000 });

    await composer.press('Escape');

    await expect(stopButton).toBeHidden({ timeout: 15000 });
  });

  test('escape closes an open composer menu and leaves the turn running', async ({ page }) => {
    await signIn(page);
    await page.goto('/chat');

    const composer = page.getByRole('textbox').first();
    await composer.waitFor({ state: 'visible', timeout: 20000 });

    await composer.fill(
      `Write a detailed history of the typewriter in at least ten paragraphs. (ref ${Date.now()})`,
    );
    await composer.press('Enter');

    const stopButton = page.getByRole('button', { name: STOP_BUTTON_NAME });
    await stopButton.waitFor({ state: 'visible', timeout: 20000 });

    await page.getByRole('button', { name: /^Add attachments and tools/ }).click();
    const plusMenu = page.getByRole('dialog', { name: PLUS_MENU_NAME });
    await expect(plusMenu).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(plusMenu).toBeHidden();
    await expect(stopButton).toBeVisible();
  });
});
