import { expect, test, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

/**
 * Every settings deep link used to render `SettingsModalRedirect`, which
 * called `openSettings(section)` and `router.replace('/chat')` in the same
 * tick: the section opened on a component tree racing its own unmount, and
 * `/chat` rendered with nothing open. The fix carries the section through
 * `/chat?settings=<key>`, a query key the chat page itself consumes once
 * mounted, so these deep-link routes have no one-time server state, and
 * reloading one is the same request/response/mount sequence as the first
 * visit.
 */
interface DeepLinkCase {
  path: string;
  heading?: string;
  navLabel?: string;
}

const DEEP_LINKS: DeepLinkCase[] = [
  { path: '/settings/archived', heading: 'Archived chats' },
  { path: '/apps', navLabel: 'Plugins' },
  { path: '/billing', heading: 'Billing', navLabel: 'Billing' },
];

async function expectSettingsOpenAt(page: Page, entry: DeepLinkCase): Promise<void> {
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
  if (entry.heading) {
    await expect(page.getByRole('heading', { name: entry.heading })).toBeVisible({
      timeout: 15000,
    });
  }
  if (entry.navLabel) {
    await expect(page.getByRole('button', { name: entry.navLabel, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
  await expect(page).toHaveURL(/\/chat$/);
}

test.describe('settings deep links', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const entry of DEEP_LINKS) {
    test(`${entry.path} opens the settings modal and survives a reload`, async ({ page }) => {
      test.setTimeout(120_000);

      await page.goto(entry.path, { waitUntil: 'domcontentloaded' });
      await expectSettingsOpenAt(page, entry);

      await page.goto(entry.path, { waitUntil: 'domcontentloaded' });
      await expectSettingsOpenAt(page, entry);
    });
  }

  test('an unrecognized settings section still 404s', async ({ page }) => {
    await page.goto('/settings/not-a-real-section', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
