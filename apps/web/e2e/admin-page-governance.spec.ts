import { test, expect } from '@playwright/test';
import { signIn } from './qa-capability-harness';

const OPERATOR_PAGES = [
  { route: '/admin/plugins', heading: 'Plugin moderation' },
  { route: '/admin/releases', heading: 'Releases' },
] as const;

const WORKSPACE_DELETION_ROUTE = '/admin/workspace-deletion';

test.describe('admin pages added for operators and workspace owners', () => {
  for (const route of [...OPERATOR_PAGES.map((page) => page.route), WORKSPACE_DELETION_ROUTE]) {
    test(`${route} sends a signed-out visitor to sign in`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      await expect(page).toHaveURL(/\/login\?/);
      expect(new URL(page.url()).searchParams.get('redirectTo')).toBe(route);
    });
  }

  for (const { route, heading } of OPERATOR_PAGES) {
    test(`${route} never renders for a non-operator account`, async ({ page }) => {
      await signIn(page);
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toHaveCount(
        0,
      );
    });
  }

  test(`${WORKSPACE_DELETION_ROUTE} never offers deletion before the name is typed`, async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(WORKSPACE_DELETION_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const schedule = page.getByRole('button', { name: 'Schedule deletion' });
    if (new URL(page.url()).pathname === WORKSPACE_DELETION_ROUTE) {
      await expect(
        page.getByRole('heading', { level: 1, name: 'Delete this workspace' }),
      ).toBeVisible();
      if ((await schedule.count()) > 0) await expect(schedule).toBeDisabled();
    } else {
      await expect(schedule).toHaveCount(0);
    }
  });
});
