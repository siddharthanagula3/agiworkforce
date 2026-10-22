import { expect, test } from '@playwright/test';
import { signIn } from './qa-capability-harness';

const CHATS_PAGE = '/chat/chats';

test.describe('chats and tasks page', () => {
  test('signed out, /chat/chats keeps the destination through sign-in', async ({ page }) => {
    await page.goto(CHATS_PAGE, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login\?/);
    expect(new URL(page.url()).searchParams.get('redirectTo')).toBe(CHATS_PAGE);
  });

  test('signed in, /chat/chats settles on the list or the empty answer, with search and filters', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(CHATS_PAGE, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1, name: 'Chats and tasks' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Loading chats and tasks')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole('searchbox', { name: 'Search chats and tasks' })).toBeVisible();
    await expect(
      page
        .getByText('No chats or tasks yet. Start one with New.')
        .or(
          page
            .getByRole('link')
            .filter({ has: page.locator('time') })
            .first(),
        )
        .or(page.getByRole('button', { name: 'Retry' })),
    ).toBeVisible();
  });
});
