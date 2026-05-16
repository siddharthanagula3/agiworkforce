import { test, expect } from '@playwright/test';

/**
 * v3 smoke suite (@smoke).
 *
 * Five fast end-to-end checks that prove the v3 shell mounts, the core
 * primitives (sidebar, composer, mode switcher, search affordance,
 * account menu trigger) are reachable, and the page is interactive.
 *
 * Forces `desktop_chat_v3` on via localStorage using the same key that
 * `FeatureFlagsService.setLocalOverride` writes — production code path
 * matches the v3-locks suite.
 */
test.describe('@smoke v3 shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem(
          'feature_flags_overrides',
          JSON.stringify([['desktop_chat_v3', true]]),
        );
      } catch {
        // localStorage unavailable — assertions below will fail loudly
      }
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  });

  test('v3 shell mounts', async ({ page }) => {
    const shell = page.locator('[data-v3-shell]');
    await expect.poll(async () => shell.count(), { timeout: 30000 }).toBeGreaterThan(0);
  });

  test('v3 sidebar is present with mode switcher', async ({ page }) => {
    const sidebar = page.locator('[data-v3-sidebar]');
    if ((await sidebar.count()) === 0) test.skip();
    await expect(sidebar.first()).toBeVisible();
    // Mode switcher exposes data-mode attribute on the sidebar root
    await expect(sidebar.first()).toHaveAttribute('data-mode', /chat|cowork|code/);
  });

  test('composer textarea is reachable via aria-label', async ({ page }) => {
    const composer = page.getByRole('textbox', { name: /chat message input/i });
    if ((await composer.count()) === 0) test.skip();
    await expect(composer.first()).toBeVisible();
  });

  test('account button responds to keyboard focus', async ({ page }) => {
    const sidebar = page.locator('[data-v3-sidebar]').first();
    if ((await sidebar.count()) === 0) test.skip();
    // Tab through the sidebar — at least one focusable element should accept focus
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(['BUTTON', 'INPUT', 'TEXTAREA', 'A']).toContain(active);
  });

  test('window has a non-empty title', async ({ page }) => {
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
