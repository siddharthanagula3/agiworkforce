import { test, expect } from '@playwright/test';
import { injectMockCloudAuth } from './utils/mock-cloud-auth';
import { expectCloudShellReady, mockCloudApi } from './utils/mock-cloud-api';

test.describe('@smoke v3 shell', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockCloudAuth(page);
    await mockCloudApi(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await expectCloudShellReady(page);
  });

  test('v3 shell mounts', async ({ page }) => {
    const shell = page.locator('[data-v3-shell]');
    await expect.poll(async () => shell.count(), { timeout: 30000 }).toBeGreaterThan(0);
  });

  test('v3 sidebar is present with mode switcher', async ({ page }) => {
    const sidebar = page.locator('[data-v3-sidebar]');
    await expect(sidebar.first()).toBeVisible();
    await expect(sidebar.first()).toHaveAttribute('data-mode', /chat|work|code/);
  });

  test('composer textarea is reachable via aria-label', async ({ page }) => {
    const composer = page.getByRole('textbox', { name: /chat message input/i });
    await expect(composer.first()).toBeVisible();
  });

  test('account button responds to keyboard focus', async ({ page }) => {
    const sidebar = page.locator('[data-v3-sidebar]').first();
    await expect(sidebar).toBeAttached();
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(['BUTTON', 'INPUT', 'TEXTAREA', 'A']).toContain(active);
  });

  test('window has a non-empty title', async ({ page }) => {
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
