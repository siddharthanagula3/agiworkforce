import { test, expect, type Page } from '@playwright/test';

// Vendor-response states are covered in features/auth/__tests__/AuthFlow.states.test.tsx.
// Here is what only a browser answers: real focus order and real layout at real widths.
const ROUTES = ['/login', '/signup'] as const;

const PHONE = { width: 390, height: 844 };
const ZOOMED = { width: 640, height: 512 };

async function openAuth(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: 'load' });
  await expect(page.getByTestId('auth-layout')).toBeVisible();
}

test.describe('auth flow states', () => {
  for (const route of ROUTES) {
    test(`${route} starts on the email step with the field focused`, async ({ page }) => {
      await openAuth(page, route);

      const email = page.getByLabel('Email address');
      await expect(email).toBeVisible();
      await expect(email).toBeFocused();
      await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });

    test(`${route} keeps a live region in the tree before it has anything to say`, async ({
      page,
    }) => {
      await openAuth(page, route);

      const status = page.getByTestId('auth-phase');
      await expect(status).toHaveAttribute('aria-live', 'polite');
      await expect(status).toHaveText('');
    });

    test(`${route} reaches every control from the keyboard alone`, async ({ page }) => {
      await openAuth(page, route);

      const reached: string[] = [];
      for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press('Tab');
        reached.push(
          await page.evaluate(() => {
            const active = document.activeElement;
            if (!active || active === document.body) return '';
            return `${active.tagName.toLowerCase()}:${(active.textContent ?? '').trim().slice(0, 32)}`;
          }),
        );
      }

      expect(reached.filter((entry) => entry.startsWith('button'))).not.toHaveLength(0);
      expect(reached.filter((entry) => entry === '')).toHaveLength(0);
    });

    test(`${route} fits a phone with no sideways scroll`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await openAuth(page, route);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test(`${route} survives a 200% zoom without clipping its controls`, async ({ page }) => {
      await page.setViewportSize(ZOOMED);
      await openAuth(page, route);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      const submit = page.getByRole('button', { name: 'Continue' });
      const box = await submit.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
    });
  }

  test('an email with no account names the way over to sign-up', async ({ page }) => {
    await openAuth(page, '/login');

    await page.getByLabel('Email address').fill(`no-account-${Date.now()}@example.invalid`);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up instead.' })).toBeVisible();
  });
});
