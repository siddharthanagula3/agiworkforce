import { test, expect } from '@playwright/test';

test.describe('/legal/archive', () => {
  test('a policy page leads to its earlier versions and back', async ({ page }) => {
    const response = await page.goto('/terms');
    expect(response?.status()).toBe(200);

    await page.getByRole('link', { name: 'Previous versions' }).click();
    await expect(page).toHaveURL(/\/legal\/archive\/terms$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Version history.' })).toBeVisible();

    const versions = page.getByRole('list', { name: 'Versions' });
    await expect(versions.getByText('2026-08-11')).toBeVisible();
    await expect(versions.getByText('The full text of this version was not kept.')).toBeVisible();

    await versions
      .getByRole('listitem')
      .filter({ hasText: '2026-08-11' })
      .getByRole('link', { name: 'Read this version' })
      .click();
    await expect(page).toHaveURL(/\/legal\/archive\/terms\/2026-08-11$/);
    await expect(
      page.getByText(
        'This version applied until the version dated 2026-09-23 replaced it on this site.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: '02 · Eligibility and age' })).toBeVisible();

    await page.getByRole('link', { name: 'Read the current version' }).click();
    await expect(page).toHaveURL(/\/terms$/);
  });

  test('an archived version steps back to the one before it', async ({ page }) => {
    const response = await page.goto('/legal/archive/privacy/2026-09-22');
    expect(response?.status()).toBe(200);

    await expect(
      page.getByText(
        'This version was settled on 2026-09-22 and replaced on 2026-09-27 before it was published on this site; the first version published here after it is dated 2026-09-29.',
      ),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Previous version, dated 2026-09-21' }).click();
    await expect(page).toHaveURL(/\/legal\/archive\/privacy\/2026-09-21$/);
    await expect(page.getByText('Last updated: 2026-09-21.')).toBeVisible();
  });

  test('a date with no archived text is not served', async ({ page }) => {
    const response = await page.goto('/legal/archive/terms/2026-09-22');
    expect(response?.status()).toBe(404);
  });
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 1024, 390, 320]) {
    test(`connector disclosure fits ${width}px in ${theme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      expect((await page.goto('/agent-permissions'))?.status()).toBe(200);

      await expect(page.getByRole('button', { name: /Switch to (light|dark) mode/ })).toBeVisible();
      const switchTheme = page.getByRole('button', { name: `Switch to ${theme} mode` });
      if (await switchTheme.isVisible()) await switchTheme.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const connectors = page.locator('#connectors');
      await connectors.scrollIntoViewIfNeeded();
      await expect(
        connectors.getByRole('heading', { name: 'What connectors request.' }),
      ).toBeVisible();
      await expect(connectors.getByText(/Selected connectors can be connected/)).toBeVisible();
      await expect(connectors.getByText(/none can be connected yet/)).toHaveCount(0);
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0);
    });
  }
}

test('connector availability history preserves the previously published disclosure', async ({
  page,
}) => {
  expect((await page.goto('/agent-permissions'))?.status()).toBe(200);
  await page.getByRole('link', { name: 'Previous versions' }).click();
  await expect(page).toHaveURL(/\/legal\/archive\/agent-permissions$/);

  await page
    .getByRole('list', { name: 'Versions' })
    .getByRole('listitem')
    .filter({ has: page.getByText('2026-10-08', { exact: true }) })
    .getByRole('link', { name: 'Read this version' })
    .click();
  await expect(page).toHaveURL(/\/legal\/archive\/agent-permissions\/2026-10-08$/);
  await expect(page.getByText(/none can be connected yet/)).toBeVisible();
  await expect(page.getByText('Load connector tools', { exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'Read the current version' }).click();
  await expect(page).toHaveURL(/\/agent-permissions$/);
  await expect(
    page.locator('#connectors').getByText(/Selected connectors can be connected/),
  ).toBeVisible();
});
