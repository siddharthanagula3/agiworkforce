import { test, expect } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * Slice E item 1. The chat page registers its own Cmd/Ctrl+K binding (for
 * `GlobalSearchDialog`, "Search Conversations") in the bubble phase on
 * `document`. `CommandPaletteProvider` used to skip the chat route entirely
 * so the two never collided, which is also why Cmd+K did nothing there: the
 * chat binding did not reliably fire. `CommandPaletteProvider` now listens in
 * the capture phase and calls `stopPropagation`, so it wins on every route
 * with no dependence on jsdom's lack of a real capture/bubble distinction,
 * which is exactly what a component test cannot exercise.
 */
test.describe('global command palette shortcut', () => {
  test('opens the command palette on the chat page and suppresses the old search dialog', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/chat');
    await page.getByRole('textbox', { name: 'Message input' }).waitFor({ state: 'visible' });

    await page.keyboard.press('Meta+k');

    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('dialog', { name: 'Search Conversations' })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'New chat' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('opens the command palette on a non-chat route too', async ({ page }) => {
    await signIn(page);
    await page.goto('/chat/projects');
    await page.getByRole('heading', { name: 'Projects' }).waitFor({ state: 'visible' });

    await page.keyboard.press('Meta+k');

    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible({
      timeout: 5000,
    });
  });
});
