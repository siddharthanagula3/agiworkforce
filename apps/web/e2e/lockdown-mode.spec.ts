import { expect, test } from '@playwright/test';
import { signIn } from './qa-capability-harness';

test('lockdown mode persists and is reflected back to the account', async ({ page }) => {
  await signIn(page);
  await page.goto('/settings/capabilities', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[aria-label="Lockdown mode"]', { timeout: 30_000 });

  const toggle = page.getByRole('switch', { name: 'Lockdown mode' });
  await toggle.scrollIntoViewIfNeeded();
  await expect(toggle).toBeVisible();

  const before = await page.request.get('/api/settings/preferences?namespace=lockdown');
  expect(before.ok()).toBe(true);

  await toggle.click();
  await expect(page.getByText('Connector tools are unavailable in every chat')).toBeVisible({
    timeout: 15_000,
  });
  // The banner above is optimistic state; "Saved." only renders once the PUT resolves.
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 15_000 });

  const after = await page.request.get('/api/settings/preferences?namespace=lockdown');
  expect(await after.json()).toMatchObject({ settings: { enabled: true } });

  await page.goto('/settings/capabilities', { waitUntil: 'domcontentloaded' });
  const reloaded = page.getByRole('switch', { name: 'Lockdown mode' });
  await reloaded.waitFor({ state: 'visible', timeout: 30_000 });
  await reloaded.scrollIntoViewIfNeeded();
  await expect(reloaded).toBeChecked();

  await reloaded.click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 15_000 });
  const restored = await page.request.get('/api/settings/preferences?namespace=lockdown');
  expect(await restored.json()).toMatchObject({ settings: { enabled: false } });
});
