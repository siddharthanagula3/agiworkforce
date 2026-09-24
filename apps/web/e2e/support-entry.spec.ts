import { expect, test } from '@playwright/test';

import { CONTACT_EMAIL } from '@/lib/legal-constants';
import { signIn } from './qa-capability-harness';

test('chat reaches the published support email in two clicks', async ({ page }) => {
  await signIn(page);
  await page.goto('/chat', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  await page.getByRole('button', { name: /account menu for/i }).click();

  const emailSupport = page.getByRole('menuitem', { name: 'Email support', exact: true });
  await expect(emailSupport).toHaveAttribute('href', `mailto:${CONTACT_EMAIL}`);
  await emailSupport.evaluate((node) => {
    node.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        document.body.dataset['supportMailto'] = (event.currentTarget as HTMLAnchorElement).href;
      },
      { once: true },
    );
  });
  await emailSupport.click();

  await expect(page.locator('body')).toHaveAttribute(
    'data-support-mailto',
    `mailto:${CONTACT_EMAIL}`,
  );
  await expect(page.locator('[data-support-widget]')).toHaveCount(0);
});
