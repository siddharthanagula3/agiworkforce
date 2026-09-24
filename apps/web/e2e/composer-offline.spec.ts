import { expect, test } from '@playwright/test';

import { signIn } from './qa-capability-harness';

test.describe('composer offline recovery', () => {
  test('preserves the draft, explains the disabled send, and recovers after reconnect', async ({
    context,
    page,
  }) => {
    await signIn(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });

    const composer = page.getByRole('textbox', { name: /message input/i });
    await expect(composer).toBeEditable({ timeout: 20_000 });
    await composer.fill('Send this after reconnecting');

    await context.setOffline(true);
    const send = page.getByRole('button', { name: 'Send message' });
    await expect(send).toBeDisabled();
    await expect(send).toHaveAccessibleDescription(
      'You are offline. Your draft is saved here and can be sent after you reconnect.',
    );
    await expect(composer).toHaveValue('Send this after reconnecting');

    await context.setOffline(false);
    await expect(send).toBeEnabled();
    await expect(composer).toHaveValue('Send this after reconnecting');
  });
});
