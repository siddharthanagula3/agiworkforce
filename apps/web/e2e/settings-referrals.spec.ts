import { expect, test, type Locator, type Page } from '@playwright/test';

import { signIn } from './qa-capability-harness';

const REFERRALS_PATH = '/settings/referrals';
const INVITE_LINK = /\/r\/[0-9A-HJKMNP-TV-Z]{8}$/;

async function openReferrals(page: Page): Promise<{ dialog: Locator; inviteLink: Locator }> {
  await page.goto(REFERRALS_PATH, { waitUntil: 'domcontentloaded' });

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/chat/);
  await expect(dialog.getByRole('button', { name: 'Referrals', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const inviteLink = dialog.getByRole('textbox', { name: 'Invite link' });
  await expect(inviteLink).toHaveValue(INVITE_LINK, { timeout: 20_000 });
  return { dialog, inviteLink };
}

test.describe('settings referrals', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signIn(page);
  });

  test(`${REFERRALS_PATH} opens Referrals with the invite link the API returns`, async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const { dialog, inviteLink } = await openReferrals(page);

    const overview = await page.request.get('/api/referrals');
    expect(overview.status()).toBe(200);
    const body = (await overview.json()) as { code: string | null; link: string | null };
    expect(body.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(body.link).toBe(await inviteLink.inputValue());

    await expect(dialog.getByRole('heading', { name: 'Referrals', level: 1 })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Your progress' })).toBeVisible();
    for (const label of ['Friends joined', 'Subscribed', 'Credits earned', 'Bonus credits left']) {
      await expect(dialog.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(dialog.getByRole('heading', { name: 'Friends' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'How it works' })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'referral program terms' })).toHaveAttribute(
      'href',
      '/referral-terms',
    );
  });

  test('copies the invite link to the clipboard and says so', async ({ page }) => {
    test.setTimeout(120_000);

    const { dialog, inviteLink } = await openReferrals(page);

    await dialog.getByRole('button', { name: 'Copy link' }).click();

    await expect(dialog.getByRole('status')).toHaveText('Invite link copied.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await inviteLink.inputValue(),
    );
  });

  test('keeps one code for the account across visits', async ({ page }) => {
    test.setTimeout(120_000);

    const first = await (await openReferrals(page)).inviteLink.inputValue();
    const second = await (await openReferrals(page)).inviteLink.inputValue();

    expect(second).toBe(first);
  });
});
