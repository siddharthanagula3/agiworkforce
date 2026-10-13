import { expect, test } from '@playwright/test';
import { connectorsReleased } from '@agiworkforce/types';

interface PublicIdentityPage {
  path: string;
  heading: string;
  signInLabel: string;
}

const PAGES: PublicIdentityPage[] = [
  {
    path: '/apps',
    heading: 'Apps are packs you install into AGI',
    signInLabel: 'Sign in to install apps',
  },
  {
    path: '/connectors',
    heading: 'Connectors bring your own tools into a thread',
    signInLabel: connectorsReleased() ? 'Sign in to add a connector' : 'Sign in to see connectors',
  },
  {
    path: '/skills',
    heading: 'Skills live in your workspace',
    signInLabel: 'Sign in to use skills',
  },
];

function signInHref(path: string): string {
  return `/login?redirectTo=${encodeURIComponent(path)}`;
}

test.describe('public pages that decide between signed-in and signed-out on the server', () => {
  for (const entry of PAGES) {
    test(`${entry.path} carries its signed-out explanation in the first response`, async ({
      request,
    }) => {
      const response = await request.get(entry.path, { maxRedirects: 0 });

      expect(response.status()).toBe(200);
      const body = await response.text();
      expect(body).toContain(`${entry.heading}</h1>`);
      expect(body).toContain(`href="${signInHref(entry.path)}"`);
    });

    test(`${entry.path} stays on its own address for a signed-out visitor`, async ({ page }) => {
      await page.goto(entry.path, { waitUntil: 'domcontentloaded' });

      await expect(page.getByRole('heading', { level: 1, name: entry.heading })).toBeVisible();
      await expect(page.getByRole('link', { name: entry.signInLabel })).toHaveAttribute(
        'href',
        signInHref(entry.path),
      );
      expect(new URL(page.url()).pathname).toBe(entry.path);
    });
  }
});
