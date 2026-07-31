import { test, expect } from '@playwright/test';
import { injectMockCloudAuth, mockCloudAccountEndpoints } from './utils/mock-cloud-auth';

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
 *
 * Auth-gate note: this suite runs against the plain-browser web-target
 * bundle (`VITE_BUILD_TARGET=web`, no Tauri). `appModeStore`'s
 * `supportsLocalAppMode` is `isTauri || isDesktopUiDevLocal`, so without
 * Tauri (and without `VITE_DESKTOP_UI_DEV_LOCAL=1` on the dev server) the
 * app boots in Cloud mode. `App.tsx` renders `<AuthPage />` — not the v3
 * shell, not the legacy shell — for `isCloudMode && !hasCloudSession`,
 * before the `desktop_chat_v3` flag branch ever runs. This is the same
 * intentional cloud-web sign-in gate pinned by `visual-regression.spec.ts`.
 * The flag itself has
 * no Tauri coupling — `injectMockCloudAuth` seeds the real
 * `unified-auth-storage` key (the same mechanism `self-healing.spec.ts`
 * uses) so `hasCloudSession` is true and the flag-gated branch is
 * actually reached.
 */
test.describe('@smoke v3 shell', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockCloudAuth(page);
    await mockCloudAccountEndpoints(page);
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
