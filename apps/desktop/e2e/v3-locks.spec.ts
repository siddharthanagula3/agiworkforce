import { test, expect } from '@playwright/test';
import { injectMockCloudAuth, mockCloudAccountEndpoints } from './utils/mock-cloud-auth';

/**
 * v3 anti-pattern lock suite (@locks).
 *
 * These tests pin the design-spec-2026-05-15 contract for the v3 desktop
 * chat shell. They are intentionally narrow — each assertion maps to a
 * single locked decision — so a regression points directly at the broken
 * lock.
 *
 * The suite forces the `desktop_chat_v3` flag on via the same localStorage
 * key (`feature_flags_overrides`) that `FeatureFlagsService.setLocalOverride`
 * writes — so it exercises the production code path and doesn't need any
 * test-only hatch in `App.tsx`.
 *
 * Auth-gate note: this suite runs against the plain-browser web-target
 * bundle (`VITE_BUILD_TARGET=web`, no Tauri). `appModeStore`'s
 * `supportsLocalAppMode` is `isTauri || isDesktopUiDevLocal`, so without
 * Tauri the app boots in Cloud mode, and `App.tsx` renders `<AuthPage />`
 * for `isCloudMode && !hasCloudSession` — before the `desktop_chat_v3`
 * flag branch ever runs. `visual-verification.spec.ts` documents this same
 * gate as intentional for the cloud-web bundle ("desktop root (sign-in)
 * renders"). The flag resolution itself has no Tauri coupling; the fix is
 * `injectMockCloudAuth`, which seeds the real `unified-auth-storage`
 * persisted key (the same mechanism `self-healing.spec.ts` already uses)
 * so `hasCloudSession` is true and the flag-gated branch is reached.
 *
 * Heads-up: these tests rely on the dev server being up on PLAYWRIGHT_BASE_URL.
 * In CI the workflow starts the server before running playwright; locally,
 * run `pnpm dev:desktop` in a separate terminal first.
 */
test.describe('@locks v3 shell anti-patterns', () => {
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
        // localStorage unavailable — test will surface the missing flag via assertion below
      }
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  });

  test('v3 shell mounts when the flag is on', async ({ page }) => {
    const shell = page.locator('[data-v3-shell]');
    // The marker proves the lazy chunk loaded and the flag-gated branch ran
    // now that the mock cloud session clears the auth gate above.
    await expect.poll(async () => shell.count(), { timeout: 30000 }).toBeGreaterThan(0);
  });

  test('no "AGI Workforce" copy is rendered inside the v3 shell', async ({ page }) => {
    const shell = page.locator('[data-v3-shell]').first();
    // The beforeEach's mock cloud session guarantees the shell mounts (see
    // "v3 shell mounts when the flag is on" above); assert directly rather
    // than skip so a future regression fails loudly instead of vanishing.
    await expect(shell).toBeAttached();
    await expect(shell.getByText(/AGI Workforce/i)).toHaveCount(0);
  });

  test('ModeSelectionDialog is not in the document', async ({ page }) => {
    // The component was removed in 2026-05; an eslint rule blocks re-imports
    // and this test catches a runtime regression if one slips through.
    const candidates = page.locator(
      '[data-component="mode-selection-dialog"], [data-testid="mode-selection-dialog"]',
    );
    await expect(candidates).toHaveCount(0);
  });

  test('cap modal stays hidden when no budget cap is active', async ({ page }) => {
    // The hard-stop modal is mounted only when budget.enabled && usagePercent >= 100.
    // In default test state with mock LLM the budget store is disabled.
    const capModal = page.locator('[data-component="cap-modal"]');
    await expect(capModal).toHaveCount(0);
  });
});
