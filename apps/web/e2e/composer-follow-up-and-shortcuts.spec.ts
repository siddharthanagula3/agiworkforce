import { test, expect, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

const STOP_BUTTON_NAME = 'Stop the current response';
const LONG_PROMPT = (topic: string) =>
  `Write a detailed history of ${topic} in at least ten paragraphs. (ref ${Date.now()})`;

async function startLongTurn(page: Page, topic: string) {
  await signIn(page);
  await page.goto('/chat');
  const composer = page.getByRole('textbox').first();
  await composer.waitFor({ state: 'visible', timeout: 20000 });
  await composer.fill(LONG_PROMPT(topic));
  await composer.press('Enter');
  const stopButton = page.getByRole('button', { name: STOP_BUTTON_NAME });
  await stopButton.waitFor({ state: 'visible', timeout: 20000 });
  return { composer, stopButton };
}

test.describe('follow-ups while a reply streams', () => {
  test('Enter steers by default: the reply stops and the follow-up is sent next', async ({
    page,
  }) => {
    const { composer } = await startLongTurn(page, 'the bicycle');
    const followUp = `Actually, keep it to one paragraph. (ref ${Date.now()})`;

    await composer.fill(followUp);
    await composer.press('Enter');

    await expect(page.getByText(followUp, { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('queued-followup')).toHaveCount(0, { timeout: 20000 });
  });

  test('Cmd/Ctrl+Shift+Enter queues instead, and the reply keeps running', async ({ page }) => {
    const { composer, stopButton } = await startLongTurn(page, 'the typewriter');
    const followUp = `Then list three sources. (ref ${Date.now()})`;

    await composer.fill(followUp);
    await composer.press('ControlOrMeta+Shift+Enter');

    await expect(page.getByTestId('queued-followup')).toContainText(`Queued: ${followUp}`);
    await expect(stopButton).toBeVisible();
  });
});

test.describe('shortcut event order in a real browser', () => {
  test('the invert chord in the composer reaches no app shortcut', async ({ page }) => {
    await signIn(page);
    await page.goto('/chat');
    const composer = page.getByRole('textbox').first();
    await composer.waitFor({ state: 'visible', timeout: 20000 });

    await composer.press('ControlOrMeta+Shift+Enter');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(composer).toBeFocused();
  });

  test('the help dialog opens from the keyboard and lists the composer keys', async ({ page }) => {
    await signIn(page);
    await page.goto('/chat');
    await page.getByRole('textbox').first().waitFor({ state: 'visible', timeout: 20000 });

    await page.keyboard.press('ControlOrMeta+/');

    const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Message composer' })).toBeVisible();
    await expect(
      dialog.getByText('While a reply runs, send this follow-up the other way (steer or queue)'),
    ).toBeVisible();
  });
});
