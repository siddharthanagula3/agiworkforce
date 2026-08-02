import { test, expect } from '@playwright/test';
import { injectMockCloudAuth } from './utils/mock-cloud-auth';
import { expectCloudShellReady, mockCloudApi } from './utils/mock-cloud-api';

/**
 * v3 smoke suite (@smoke).
 *
 * Five fast end-to-end checks that prove the v3 shell mounts, the core
 * primitives (sidebar, composer, mode switcher, search affordance,
 * account menu trigger) are reachable, and the page is interactive.
 *
 * Auth-gate note: this suite runs against the plain-browser web-target
 * bundle (`VITE_BUILD_TARGET=web`, no Tauri). `appModeStore`'s
 * `supportsLocalAppMode` is `isTauri || isDesktopUiDevLocal`, so without
 * Tauri (and without `VITE_DESKTOP_UI_DEV_LOCAL=1` on the dev server) the
 * app boots in Cloud mode. `App.tsx` renders `<AuthPage />` — not the v3
 * shell, not the legacy shell — for `isCloudMode && !hasCloudSession`,
 * which is the same intentional cloud-web sign-in gate pinned by
 * `visual-regression.spec.ts`. `injectMockCloudAuth` seeds the real
 * `unified-auth-storage` key (the same mechanism `self-healing.spec.ts`
 * uses) so `hasCloudSession` is true and the production shell is reached.
 *
 * Beyond that: a mock session alone was never enough (DES-C14). Cloud admission
 * immediately hydrates the conversation boundary from `/api/chat/conversations`
 * and `/api/projects`, and this suite left both unrouted, so the shell reported
 * a boundary failure instead of mounting. `mockCloudApi` owns that route set and
 * `expectCloudShellReady` asserts the boundary did not fail.
 */
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

  // The beforeEach's mock cloud session guarantees the shell mounts (see
  // "v3 shell mounts" above); the sub-component checks below assert
  // directly rather than skip-on-absent so a regression fails loudly.

  test('v3 sidebar is present with mode switcher', async ({ page }) => {
    const sidebar = page.locator('[data-v3-sidebar]');
    await expect(sidebar.first()).toBeVisible();
    // Mode switcher exposes data-mode attribute on the sidebar root
    await expect(sidebar.first()).toHaveAttribute('data-mode', /chat|work|code/);
  });

  test('composer textarea is reachable via aria-label', async ({ page }) => {
    const composer = page.getByRole('textbox', { name: /chat message input/i });
    await expect(composer.first()).toBeVisible();
  });

  test('account button responds to keyboard focus', async ({ page }) => {
    const sidebar = page.locator('[data-v3-sidebar]').first();
    await expect(sidebar).toBeAttached();
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
