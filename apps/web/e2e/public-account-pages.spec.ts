import { test, expect } from '@playwright/test';

const WELL_FORMED_HANDOFF = 'A'.repeat(43);

test.describe('public account recovery pages', () => {
  test('/appeal renders the appeal form without submitting it', async ({ page }) => {
    await page.goto('/appeal', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { level: 1, name: 'Appeal a suspension' }),
    ).toBeVisible();
    await expect(page.getByLabel('Email address of the suspended account')).toBeVisible();
    await expect(page.getByLabel('Why should the suspension be lifted?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit appeal' })).toBeDisabled();
  });

  test('/recover preselects the lost item named in the link', async ({ page }) => {
    await page.goto('/recover?lost=email', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { level: 1, name: 'Recover your account' }),
    ).toBeVisible();
    await expect(
      page.getByRole('radio', { name: 'Access to the email address on the account' }),
    ).toBeChecked();
    await expect(page.getByRole('button', { name: 'Request recovery' })).toBeVisible();
  });

  test('/login/not-me without its email token offers nothing to turn off', async ({ page }) => {
    await page.goto('/login/not-me', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1, name: 'Was this not you?' })).toBeVisible();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'This link is incomplete. Open it again from the email.' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Turn it off and sign everyone out' }),
    ).toHaveCount(0);
  });

  test('/login/verify sends a signed-out visitor to sign in, then on to chat', async ({ page }) => {
    await page.goto('/login/verify', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/login\?/);
    expect(new URL(page.url()).searchParams.get('redirectTo')).toBe('/chat');
  });

  test('/login/verify shows the confirmation step for a well-formed handoff', async ({ page }) => {
    await page.goto(`/login/verify?handoff=${WELL_FORMED_HANDOFF}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { level: 1, name: 'Confirm sign-in' })).toBeVisible();
  });
});

test.describe('desktop sign-in handoff pages', () => {
  test('/auth/desktop without a challenge sends the visitor back to the app', async ({ page }) => {
    const response = await page.goto('/auth/desktop', { waitUntil: 'domcontentloaded' });

    expect(response?.status()).toBeLessThan(400);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Start from the desktop app' }),
    ).toBeVisible();
  });

  test('/auth/desktop/complete without a grant says the sign-in did not finish', async ({
    page,
  }) => {
    await page.goto('/auth/desktop/complete', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { level: 1, name: 'Sign-in did not finish' }),
    ).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: 'This sign-in link is incomplete.' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in here instead' })).toBeVisible();
  });
});
